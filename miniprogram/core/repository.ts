import { ExpenseGroup, hasGroupContent, hasReportContent, newGroup, newReport, Reimbursement, validId } from './model';

export interface FileStore {
  mkdir(path: string): void;
  readText(path: string): string;
  writeText(path: string, text: string): void;
  copy(from: string, to: string): void;
  rename(from: string, to: string): void;
  list(path: string): string[];
  exists(path: string): boolean;
}

// All edits read the latest manifest; a page never writes back a stale whole record.
export class Repository {
  constructor(private readonly fs: FileStore, readonly root: string) {}

  path(id: string, relative = ''): string {
    if (!validId(id) || relative.split('/').some(part => part === '..') || /[\\:]/.test(relative) || relative.startsWith('/')) throw new Error('记录路径无效。');
    return `${this.root}/${id}${relative ? '/' + relative : ''}`;
  }

  private parse(text: string, id: string): Reimbursement {
    const r = JSON.parse(text) as Reimbursement;
    if (r.schemaVersion !== 1 || r.id !== id || !Array.isArray(r.groups) || !r.assets || !Number.isInteger(r.revision) || typeof r.title !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) throw new Error('记录格式无法读取。');
    const seen = new Set<string>();
    for (const g of r.groups) {
      if (!validId(g.id) || seen.has(g.id) || typeof g.description !== 'string' || !Array.isArray(g.invoiceIds) || !Array.isArray(g.attachmentIds)) throw new Error('费用组格式无法读取。');
      seen.add(g.id);
      for (const aid of [...g.invoiceIds, ...g.attachmentIds]) {
        const asset = r.assets[aid];
        if (!asset || !validId(aid) || asset.id !== aid || !['pdf', 'image'].includes(asset.kind) || typeof asset.originalName !== 'string') throw new Error('材料引用无法读取。');
        this.path(id, asset.relativePath);
      }
    }
    if (r.lastExport) {
      this.path(id, r.lastExport.pdfPath);
      this.path(id, r.lastExport.wordPath);
      if (!Array.isArray(r.lastExport.ranges)) throw new Error('导出记录无法读取。');
    }
    return r;
  }

  read(id: string): Reimbursement {
    const path = this.path(id, 'project.json');
    try { return this.parse(this.fs.readText(path), id); }
    catch {
      try { return this.parse(this.fs.readText(path + '.bak'), id); }
      catch { throw new Error('这条记录无法读取。原材料仍保留在本机，请保留应用数据以便恢复。'); }
    }
  }

  save(record: Reimbursement): void {
    this.fs.mkdir(this.root);
    this.fs.mkdir(this.path(record.id));
    const path = this.path(record.id, 'project.json');
    const text = JSON.stringify(record);
    this.parse(text, record.id);
    this.fs.writeText(path + '.tmp', text);
    this.parse(this.fs.readText(path + '.tmp'), record.id);
    if (this.fs.exists(path)) {
      let valid = false;
      try { this.parse(this.fs.readText(path), record.id); valid = true; } catch { /* Preserve the existing backup if the primary file is damaged. */ }
      if (valid) this.fs.copy(path, path + '.bak');
    }
    this.fs.rename(path + '.tmp', path);
  }

  create(): Reimbursement {
    const record = newReport();
    this.save(record);
    return record;
  }

  edit(id: string, change: (record: Reimbursement) => void): Reimbursement {
    const record = this.read(id);
    change(record);
    record.revision += 1;
    record.updatedAt = new Date().toISOString();
    this.save(record);
    return record;
  }

  addGroup(id: string): ExpenseGroup {
    const group = newGroup();
    this.edit(id, r => { r.groups.push(group); });
    return group;
  }

  nextGroup(id: string, currentGroupId: string): ExpenseGroup {
    const current = this.read(id).groups.find(group => group.id === currentGroupId);
    if (!current) throw new Error('当前报销项目无法找到，请返回列表。');
    if (hasGroupContent(current)) return this.addGroup(id);
    if (current.description) {
      this.edit(id, record => { record.groups.find(group => group.id === currentGroupId)!.description = ''; });
      current.description = '';
    }
    return current;
  }

  removeEmptyGroups(id: string, importingGroupIds: readonly string[] = []): Reimbursement {
    const record = this.read(id);
    const keep = (group: ExpenseGroup) => hasGroupContent(group) || importingGroupIds.includes(group.id);
    if (record.groups.every(keep)) return record;
    // Remove only unused group entries. Original files and previous exports remain available.
    return this.edit(id, latest => { latest.groups = latest.groups.filter(keep); });
  }

  list(): { records: Reimbursement[]; unreadable: number } {
    this.fs.mkdir(this.root);
    const records: Reimbursement[] = [];
    let unreadable = 0;
    for (const id of this.fs.list(this.root).filter(validId)) {
      try {
        const record = this.read(id);
        // Default timestamps and unused groups should not create visible history.
        if (hasReportContent(record)) records.push({ ...record, groups: record.groups.filter(hasGroupContent) });
      } catch { unreadable += 1; }
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { records, unreadable };
  }
}
