import { Asset, ExportRecord, PageRange, Reimbursement, reportLabel, uid, validationErrors } from './model';
import { Repository } from './repository';

interface DocumentResult { pdfBytes: Uint8Array; wordBytes: Uint8Array; ranges: PageRange[]; pageCount: number }
export interface GenerationIO {
  read(asset: Asset): Promise<Uint8Array>;
  build(record: Reimbursement, read: (asset: Asset) => Promise<Uint8Array>, progress: (message: string) => void, title: string): Promise<DocumentResult>;
  mkdir(relative: string): void;
  write(relative: string, bytes: Uint8Array): Promise<void>;
  verify(relative: string, expected: Uint8Array): Promise<void>;
}
const active = new Set<string>();

export async function generateRecord(repository: Repository, id: string, io: GenerationIO, progress: (message: string) => void): Promise<ExportRecord> {
  if (active.has(id)) throw new Error('这次报销正在生成，请等待完成。');
  active.add(id);
  try {
    const snapshot = repository.read(id);
    const errors = validationErrors(snapshot);
    if (errors.length) throw new Error(errors.join('\n'));
    const generationId = uid();
    const directory = `exports/${generationId}`;
    const result = await io.build(snapshot, asset => io.read(asset), progress, reportLabel(snapshot));
    io.mkdir(directory);
    const pdfPath = `${directory}/凭证.pdf`;
    const wordPath = `${directory}/说明.docx`;
    await io.write(pdfPath, result.pdfBytes);
    await io.verify(pdfPath, result.pdfBytes);
    await io.write(wordPath, result.wordBytes);
    await io.verify(wordPath, result.wordBytes);
    const latest = repository.read(id);
    if (latest.revision !== snapshot.revision) throw new Error('生成期间材料发生了修改，请重新生成。上次成功结果已保留。');
    const exported: ExportRecord = { generationId, sourceRevision: snapshot.revision, generatedAt: new Date().toISOString(), title: reportLabel(snapshot), pdfPath, wordPath, ranges: result.ranges, pageCount: result.pageCount };
    latest.lastExport = exported;
    repository.save(latest);
    return exported;
  } finally { active.delete(id); }
}
