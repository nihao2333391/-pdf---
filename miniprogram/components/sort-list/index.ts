import { reorder } from '../../core/model';

export interface SortRow { id: string; title: string; detail: string; badge?: string; icon?: string }
interface DragState { source: SortRow[]; pointerY: number; top: number; scroll: number; lastDrag: number; timer?: ReturnType<typeof setInterval> }
const states = new WeakMap<object, DragState>();
function state(component: object): DragState {
  let value = states.get(component);
  if (!value) { value = { source: [], pointerY: 0, top: 0, scroll: 0, lastDrag: 0 }; states.set(component, value); }
  return value;
}
Component({
  properties: { items: { type: Array, value: [] as SortRow[] }, removable: { type: Boolean, value: false }, compact: { type: Boolean, value: false } },
  data: { rows: [] as SortRow[], from: -1, target: -1, rowHeight: 80, height: 0, scrollTop: 0, activeId: '' },
  observers: {
    'items, compact'(items: SortRow[], compact: boolean) {
      const rowHeight = Math.max(compact ? 58 : 72, wx.getWindowInfo().windowWidth * (compact ? 112 : 144) / 750);
      this.setData({ rows: items.slice(), rowHeight, height: Math.min(items.length, 5) * rowHeight });
    },
  },
  lifetimes: { detached() { this.stopTimer(); } },
  methods: {
    stopTimer() { const s = state(this); if (s.timer) clearInterval(s.timer); s.timer = undefined; },
    start(event: WechatMiniprogram.TouchEvent) {
      const from = Number(event.currentTarget.dataset.index);
      const s = state(this);
      s.source = this.data.rows.slice();
      s.pointerY = event.touches[0].clientY;
      s.scroll = this.data.scrollTop;
      this.setData({ from, target: from, activeId: s.source[from].id });
      this.createSelectorQuery().select('.sort-viewport').boundingClientRect(rect => {
        if (this.data.from < 0 || !rect || Array.isArray(rect)) return;
        s.top = rect.top;
        this.stopTimer();
        s.timer = setInterval(() => {
          const edge = 36;
          const local = s.pointerY - s.top;
          const delta = local < edge ? -12 : local > this.data.height - edge ? 12 : 0;
          const max = Math.max(0, s.source.length * this.data.rowHeight - this.data.height);
          const next = Math.min(max, Math.max(0, s.scroll + delta));
          if (next !== s.scroll) { s.scroll = next; this.setData({ scrollTop: next }); this.updateTarget(); }
        }, 40);
      }).exec();
    },
    move(event: WechatMiniprogram.TouchEvent) {
      if (this.data.from < 0) return;
      state(this).pointerY = event.touches[0].clientY;
      this.updateTarget();
    },
    updateTarget() {
      const s = state(this);
      const to = Math.min(s.source.length - 1, Math.max(0, Math.floor((s.pointerY - s.top + s.scroll) / this.data.rowHeight)));
      if (to !== this.data.target) this.setData({ rows: reorder(s.source, this.data.from, to), target: to });
    },
    end() {
      this.stopTimer();
      const { from, target } = this.data;
      if (from < 0) return;
      state(this).lastDrag = Date.now();
      this.setData({ from: -1, activeId: '' });
      if (from !== target) this.triggerEvent('reorder', { from, to: target });
    },
    cancel() {
      this.stopTimer();
      this.setData({ rows: state(this).source, from: -1, activeId: '' });
    },
    scroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
      state(this).scroll = event.detail.scrollTop;
      this.setData({ scrollTop: event.detail.scrollTop });
    },
    select(event: WechatMiniprogram.TouchEvent) {
      if (Date.now() - state(this).lastDrag > 300) this.triggerEvent('select', { id: event.currentTarget.dataset.id });
    },
    remove(event: WechatMiniprogram.TouchEvent) { this.triggerEvent('remove', { id: event.currentTarget.dataset.id }); },
    noop() {},
  },
});
