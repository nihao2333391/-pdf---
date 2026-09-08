import { repository } from '../../services/storage';
import { navigate, showError } from '../../services/ui';

// Area is width × height: compensate for horizontal gutters when sizing the cards.
export function homeLayout(width: number, height: number, bottomInset: number): string {
  const usable = Math.max(320, height - Math.max(0, bottomInset));
  const gutter = width * .06;
  const cardWidth = width - gutter * 2;
  return `--home-gutter:${gutter}px;--intro-height:${Math.max(154, usable * .25)}px;--create-height:${Math.max(190, width * usable * .35 / cardWidth)}px;--history-height:${Math.max(132, width * usable * .20 / cardWidth)}px;--action-gap:${Math.max(14, usable * .024)}px;`;
}
Page({
  data: { layoutStyle: '' },
  onLoad() { this.updateLayout(); },
  onResize() { this.updateLayout(); },
  updateLayout() {
    const window = wx.getWindowInfo();
    const bottomInset = window.safeArea ? window.screenHeight - window.safeArea.bottom : 0;
    this.setData({ layoutStyle: homeLayout(window.windowWidth, window.windowHeight, bottomInset) });
  },
  create() {
    try { navigate(`/pages/report/index?id=${repository.create().id}`); } catch (error) { showError(error); }
  },
  history() { navigate('/pages/history/index'); },
});
