import { dateLabel, reorder, validationErrors } from '../../core/model';
import { SortRow } from '../../components/sort-list/index';
import { repository } from '../../services/storage';
import { navigate, showError } from '../../services/ui';
import { generate } from '../../services/generate';
import { getImportingGroupIds } from '../../services/materials';

Page({
  data: { id: '', title: '', created: '', rows: [] as SortRow[], hasExport: false, stale: false, busy: false, progress: '', error: '', saved: '已保存到本机' },
  _timer: undefined as ReturnType<typeof setTimeout> | undefined,
  _dirty: false,
  _alive: true,
  onLoad(query: Record<string, string | undefined>) { this._alive = true; this.setData({ id: query.id || '' }); },
  onShow() {
    if (!this.data.id) return;
    try { repository.removeEmptyGroups(this.data.id, getImportingGroupIds(this.data.id)); }
    catch (error) { showError(error); }
    this.refresh();
  },
  onHide() { this.saveTitle(); },
  onUnload() { this.saveTitle(); this._alive = false; },
  refresh() {
    try {
      const r = repository.read(this.data.id);
      this.setData({
        title: this._dirty ? this.data.title : r.title, created: dateLabel(r.createdAt),
        rows: r.groups.map((g, i) => ({ id: g.id, title: `${String(i + 1).padStart(2, '0')}  ${g.description.trim() || '待填写项目描述'}`, detail: `发票 ${g.invoiceIds.length} 份 · 附件 ${g.attachmentIds.length} 份${!g.invoiceIds.length || !g.description.trim() ? ' · 待补齐' : ''}` })),
        hasExport: !!r.lastExport, stale: !!r.lastExport && r.revision !== r.lastExport.sourceRevision,
      });
    } catch (error) { showError(error); }
  },
  titleInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this._dirty = true;
    this.setData({ title: event.detail.value, saved: '保存中…' });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveTitle(), 350);
  },
  saveTitle(): boolean {
    if (this._timer) clearTimeout(this._timer);
    if (!this._dirty) return true;
    try {
      repository.edit(this.data.id, r => { r.title = this.data.title; });
      this._dirty = false;
      this.setData({ saved: '已保存到本机' });
      return true;
    } catch (error) { this.setData({ saved: '保存失败，请保留当前页面后重试' }); showError(error); return false; }
  },
  add() {
    if (this.data.busy || !this.saveTitle()) return;
    try {
      repository.removeEmptyGroups(this.data.id, getImportingGroupIds(this.data.id));
      const group = repository.addGroup(this.data.id);
      navigate(`/pages/group/index?record=${this.data.id}&group=${group.id}`);
    } catch (error) { showError(error); }
  },
  edit(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    if (!this.data.busy && this.saveTitle()) navigate(`/pages/group/index?record=${this.data.id}&group=${event.detail.id}`);
  },
  sort(event: WechatMiniprogram.CustomEvent<{ from: number; to: number }>) {
    if (this.data.busy) { this.refresh(); return; }
    try { repository.edit(this.data.id, r => { r.groups = reorder(r.groups, event.detail.from, event.detail.to); }); this.refresh(); } catch (error) { showError(error); this.refresh(); }
  },
  async generate() {
    if (this.data.busy || !this.saveTitle()) return;
    try {
      if (getImportingGroupIds(this.data.id).length) throw new Error('材料仍在选择或保存，请完成后再生成。');
      const record = repository.removeEmptyGroups(this.data.id);
      this.refresh();
      const errors = validationErrors(record);
      if (errors.length) { this.setData({ error: errors.join('\n') }); return; }
      this.setData({ busy: true, error: '', progress: '正在检查原材料…' });
      await generate(this.data.id, progress => { if (this._alive) this.setData({ progress }); });
      if (this._alive) { this.refresh(); navigate(`/pages/result/index?id=${this.data.id}`); }
    } catch (error) { showError(error); }
    finally { if (this._alive) this.setData({ busy: false, progress: '' }); }
  },
  result() { if (!this.data.busy) navigate(`/pages/result/index?id=${this.data.id}`); },
});
