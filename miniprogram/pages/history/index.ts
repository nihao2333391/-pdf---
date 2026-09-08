import { dateLabel, reportLabel } from '../../core/model';
import { repository } from '../../services/storage';
import { navigate, showError } from '../../services/ui';
interface HistoryItem { id: string; title: string; created: string; time: string; day: string; showDay: boolean; detail: string }
Page({
  data: { items: [] as HistoryItem[], unreadable: 0 },
  onShow() {
    try {
      const result = repository.list();
      let previousDay = '';
      const items = result.records.map(r => {
        const created = dateLabel(r.createdAt);
        const day = created.split(' ')[0];
        const showDay = day !== previousDay;
        previousDay = day;
        return { id: r.id, title: reportLabel(r), created, time: created.split(' ')[1], day, showDay, detail: `${r.groups.length} 项 · ${r.lastExport ? r.lastExport.sourceRevision === r.revision ? '已生成文件' : '修改后待重新生成' : '草稿'}` };
      });
      this.setData({ items, unreadable: result.unreadable });
    } catch (error) { showError(error); }
  },
  open(event: WechatMiniprogram.TouchEvent) { navigate(`/pages/report/index?id=${event.currentTarget.dataset.id}`); },
});
