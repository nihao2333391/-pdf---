import { generateRecord } from '../core/generation';
import { repository, readBytes, writeBytes, ensureDirectory } from './storage';
import { buildDocuments } from '../vendor/documents';

export async function generate(id: string, progress: (message: string) => void): Promise<void> {
  await generateRecord(repository, id, {
    read: asset => readBytes(repository.path(id, asset.relativePath)),
    build: buildDocuments,
    mkdir: relative => ensureDirectory(repository.path(id, relative)),
    write: (relative, bytes) => writeBytes(repository.path(id, relative), bytes),
    verify: async (relative, expected) => {
      const actual = await readBytes(repository.path(id, relative));
      if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) throw new Error('生成文件保存未完成，请检查本机空间后重试。');
    },
  }, progress);
}
