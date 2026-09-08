import { Asset, MaterialRole, reorder } from '../../core/model';
import { SortRow } from '../../components/sort-list/index';
import { repository } from '../../services/storage';
import { importMaterials } from '../../services/materials';
import { openFile, showError } from '../../services/ui';

function materialRow(asset: Asset): SortRow {
  const size = asset.size > 1024 * 1024 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(asset.size / 1024))} KB`;
  return { id: asset.id, title: asset.originalName, icon: `/assets/icons/${asset.kind === 'pdf' ? 'file-type-pdf' : 'photo'}.svg`, detail: `${asset.kind === 'pdf' ? 'PDF · 保留原页面' : '图片 · 生成时单独一页'} · ${size}` };
}

Page({
  data: { recordId: '', groupId: '', description: '', number: 1, invoices: [] as SortRow[], attachments: [] as SortRow[], busy: false, saved: '已保存到本机' },
  _timer: undefined as ReturnType<typeof setTimeout> | undefined,
  _dirty: false,
  _alive: true,
  onLoad(query: Record<string, string | undefined>) { this._alive = true; this.setData({ recordId: query.record || '', groupId: query.group || '' }); this.refresh(); },
  onHide() { this.save(); },
  onUnload() { this.save(); this._alive = false; },
  refresh() {
    try {
      const record = repository.read(this.data.recordId);
      const group = record.groups.find(g => g.id === this.data.groupId);
      if (!group) throw new Error('这项内容无法找到，请返回报销列表。');
      this.setData({ number: record.groups.indexOf(group) + 1, description: this._dirty ? this.data.description : group.description, invoices: group.invoiceIds.map(id => materialRow(record.assets[id])), attachments: group.attachmentIds.map(id => materialRow(record.assets[id])) });
    } catch (error) { showError(error); }
  },
  input(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this._dirty = true;
    this.setData({ description: event.detail.value, saved: '保存中…' });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), 350);
  },
  save(): boolean {
    if (this._timer) clearTimeout(this._timer);
    if (!this._dirty) return true;
    try {
      repository.edit(this.data.recordId, record => {
        const group = record.groups.find(g => g.id === this.data.groupId);
        if (!group) throw new Error('费用组无法找到。');
        group.description = this.data.description;
      });
      this._dirty = false;
      this.setData({ saved: '已保存到本机' });
      return true;
    } catch (error) { this.setData({ saved: '保存失败，请保留当前页面后重试' }); showError(error); return false; }
  },
  async add(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || !this.save()) return;
    this.setData({ busy: true });
    try { await importMaterials(this.data.recordId, this.data.groupId, event.currentTarget.dataset.role as MaterialRole); }
    catch (error) { showError(error); }
    finally { if (this._alive) { this.setData({ busy: false }); this.refresh(); } }
  },
  sort(event: WechatMiniprogram.CustomEvent<{ from: number; to: number }>) {
    if (this.data.busy) { this.refresh(); return; }
    const role = event.currentTarget.dataset.role as MaterialRole;
    try {
      repository.edit(this.data.recordId, record => {
        const group = record.groups.find(g => g.id === this.data.groupId)!;
        group[role] = reorder(group[role], event.detail.from, event.detail.to);
      });
    } catch (error) { showError(error); }
    this.refresh();
  },
  remove(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    if (this.data.busy) return;
    const role = event.currentTarget.dataset.role as MaterialRole;
    wx.showModal({ title: '移除这份材料？', content: '移除后可以重新添加，其他材料会保留。', success: result => {
      if (!result.confirm) return;
      try {
        repository.edit(this.data.recordId, r => { const g = r.groups.find(g => g.id === this.data.groupId)!; g[role] = g[role].filter(id => id !== event.detail.id); });
        this.refresh();
      } catch (error) { showError(error); }
    } });
  },
  preview(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    try {
      const asset = repository.read(this.data.recordId).assets[event.detail.id];
      const path = repository.path(this.data.recordId, asset.relativePath);
      if (asset.kind === 'pdf') openFile(path, 'pdf');
      else wx.previewImage({ urls: [path], current: path, fail: showError });
    } catch (error) { showError(error); }
  },
  next() {
    if (this.data.busy || !this.save()) return;
    try {
      const group = repository.nextGroup(this.data.recordId, this.data.groupId);
      this.setData({ groupId: group.id, description: '' });
      this.refresh();
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (error) { showError(error); }
  },
  back() { if (!this.data.busy && this.save()) wx.navigateBack({ fail: showError }); },
  removeGroup() {
    if (this.data.busy) return;
    wx.showModal({ title: '删除这一项？', content: '其他项目和上次生成的文件会保留。', confirmText: '删除', success: result => {
      if (!result.confirm) return;
      try {
        repository.edit(this.data.recordId, r => { r.groups = r.groups.filter(g => g.id !== this.data.groupId); });
        this._dirty = false;
        if (this._timer) clearTimeout(this._timer);
        wx.navigateBack({ fail: showError });
      } catch (error) { showError(error); }
    } });
  },
});
