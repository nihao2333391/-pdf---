export interface Asset {
  id: string;
  kind: 'pdf' | 'image';
  originalName: string;
  relativePath: string;
  size: number;
}
export interface ExpenseGroup {
  id: string;
  description: string;
  invoiceIds: string[];
  attachmentIds: string[];
}
export interface PageRange {
  groupId: string;
  description: string;
  startPage: number;
  endPage: number;
}
export interface ExportRecord {
  generationId: string;
  sourceRevision: number;
  generatedAt: string;
  title: string;
  pdfPath: string;
  wordPath: string;
  ranges: PageRange[];
  pageCount: number;
}
export interface Reimbursement {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  revision: number;
  groups: ExpenseGroup[];
  assets: Record<string, Asset>;
  lastExport: ExportRecord | null;
}
export type MaterialRole = 'invoiceIds' | 'attachmentIds';

export function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
export function validId(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}
export function dateLabel(value: string): string {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function reportLabel(record: Reimbursement): string {
  return record.title.trim() || dateLabel(record.createdAt);
}
export function newReport(): Reimbursement {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: uid(), createdAt: now, updatedAt: now, title: '', revision: 0, groups: [], assets: {}, lastExport: null };
}
export function newGroup(): ExpenseGroup {
  return { id: uid(), description: '', invoiceIds: [], attachmentIds: [] };
}
export function hasGroupContent(group: ExpenseGroup): boolean {
  return !!group.description.trim() || group.invoiceIds.length > 0 || group.attachmentIds.length > 0;
}
export function hasReportContent(record: Reimbursement): boolean {
  return !!record.title.trim() || !!record.lastExport || record.groups.some(hasGroupContent);
}
export function validationErrors(record: Reimbursement): string[] {
  if (!record.groups.length) return ['请先添加一项报销内容。'];
  return record.groups.flatMap((group, index) => {
    const missing = [];
    if (!group.description.trim()) missing.push('项目描述');
    if (!group.invoiceIds.length) missing.push('发票');
    return missing.length ? [`第 ${index + 1} 项：请补充${missing.join('、')}。`] : [];
  });
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items.slice();
  const result = items.slice();
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}
export function errorMessage(error: unknown): string {
  const value = error as { message?: string; errMsg?: string } | undefined;
  const message = value?.message || value?.errMsg || '操作未完成，请重试。';
  if (/quota|no space|exceed.*storage|storage.*limit/i.test(message)) return '手机本地存储空间不足。请先导出重要记录，再清理微信存储后重试。';
  return message;
}
