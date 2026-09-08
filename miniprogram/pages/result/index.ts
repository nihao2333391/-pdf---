import { dateLabel, PageRange, reportLabel } from '../../core/model';
import { repository } from '../../services/storage';
import { openFile, showError } from '../../services/ui';
Page({
  data: { id: '', title: '', generated: '', pageCount: 0, ranges: [] as PageRange[], stale: false, ready: false },
  onLoad(query: Record<string, string | undefined>) { this.setData({ id: query.id || '' }); },
  onShow() {
    try {
      const record = repository.read(this.data.id);
      const result = record.lastExport;
      if (!result) throw new Error('请先在报销列表生成文件。');
      this.setData({ ready: true, title: result.title || reportLabel(record), generated: dateLabel(result.generatedAt), pageCount: result.pageCount, ranges: result.ranges, stale: result.sourceRevision !== record.revision });
    } catch (error) { showError(error); }
  },
  open(event: WechatMiniprogram.TouchEvent) {
    try {
      const type = event.currentTarget.dataset.type as 'pdf' | 'docx';
      const result = repository.read(this.data.id).lastExport;
      if (!result) return;
      openFile(repository.path(this.data.id, type === 'pdf' ? result.pdfPath : result.wordPath), type);
    } catch (error) { showError(error); }
  },
  share(event: WechatMiniprogram.TouchEvent) {
    try {
      const type = event.currentTarget.dataset.type as 'pdf' | 'docx';
      const record = repository.read(this.data.id);
      const result = record.lastExport;
      if (!result) return;
      const base = (result.title || reportLabel(record)).replace(/[\\/:*?"<>|]/g, '-').slice(0, 70);
      wx.shareFileMessage({ filePath: repository.path(this.data.id, type === 'pdf' ? result.pdfPath : result.wordPath), fileName: `${base}-${type === 'pdf' ? '凭证.pdf' : '说明.docx'}`, fail: error => { if (!/cancel/i.test(error.errMsg)) showError(error); } });
    } catch (error) { showError(error); }
  },
  back() { wx.navigateBack({ fail: showError }); },
});
