import { Asset, PageRange, Reimbursement } from '../core/model';
export interface DocumentResult { pdfBytes: Uint8Array; wordBytes: Uint8Array; ranges: PageRange[]; pageCount: number }
export function buildDocuments(record: Reimbursement, readAsset: (asset: Asset) => Promise<Uint8Array>, progress: (message: string) => void, title: string): Promise<DocumentResult>;
