import { errorMessage } from '../core/model';
export function showError(error: unknown): void {
  wx.showModal({ title: '请检查', content: errorMessage(error), showCancel: false });
}
export function openFile(path: string, type: 'pdf' | 'docx'): void {
  wx.openDocument({ filePath: path, fileType: type, showMenu: true, fail: showError });
}
export function navigate(url: string): void {
  wx.navigateTo({ url, fail: showError });
}
