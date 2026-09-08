import { Asset, MaterialRole, uid } from '../core/model';
import { ensureDirectory, repository } from './storage';

interface SelectedFile { path: string; name: string; size: number; type: string }
const importing = new Map<string, Set<string>>();

export function getImportingGroupIds(recordId: string): string[] {
  return Array.from(importing.get(recordId) || []);
}

function choose(source: number): Promise<SelectedFile[]> {
  return new Promise((resolve, reject) => {
    const fail = (error: WechatMiniprogram.GeneralCallbackResult) => /cancel/i.test(error.errMsg) ? resolve([]) : reject(error);
    if (source === 0) {
      wx.chooseMessageFile({ count: 10, type: 'all', success: r => resolve(r.tempFiles.map(f => ({ path: f.path, name: f.name, size: f.size, type: f.type }))), fail });
    } else {
      wx.chooseMedia({ count: 9, mediaType: ['image'], sourceType: ['album'], sizeType: ['original'], success: r => resolve(r.tempFiles.map((f, i) => ({ path: f.tempFilePath, name: `图片-${i + 1}.${f.tempFilePath.split('.').pop() || 'jpg'}`, size: f.size, type: 'image' }))), fail });
    }
  });
}

export async function importMaterials(recordId: string, groupId: string, role: MaterialRole): Promise<void> {
  let groups = importing.get(recordId);
  if (!groups) { groups = new Set(); importing.set(recordId, groups); }
  if (groups.has(groupId)) throw new Error('这一项正在选择或保存材料，请稍候。');
  groups.add(groupId);
  try { await selectAndImport(recordId, groupId, role); }
  finally {
    groups.delete(groupId);
    if (!groups.size) importing.delete(recordId);
  }
}

async function selectAndImport(recordId: string, groupId: string, role: MaterialRole): Promise<void> {
  const source = await new Promise<number | null>((resolve, reject) => wx.showActionSheet({
    itemList: ['从微信聊天选择 PDF／图片', '从手机相册选择图片'],
    success: r => resolve(r.tapIndex),
    fail: e => /cancel/i.test(e.errMsg) ? resolve(null) : reject(e),
  }));
  if (source === null) return;
  const selected = await choose(source);
  if (!selected.length) return;
  const fs = wx.getFileSystemManager();
  ensureDirectory(repository.path(recordId, 'originals'));
  const errors: string[] = [];
  wx.showLoading({ title: '正在保存原材料', mask: true });
  try {
    for (const file of selected) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const kind = ext === 'pdf' ? 'pdf' : (file.type === 'image' || /^(jpg|jpeg|png|webp|bmp|gif|heic|heif)$/.test(ext)) ? 'image' : null;
        if (!kind) throw new Error('请选择 PDF 或图片');
        const id = uid();
        const safeExt = /^[a-z0-9]{1,6}$/.test(ext) ? ext : kind === 'pdf' ? 'pdf' : 'img';
        const asset: Asset = { id, kind, originalName: file.name, size: file.size, relativePath: `originals/${id}.${safeExt}` };
        await new Promise<void>((resolve, reject) => fs.copyFile({ srcPath: file.path, destPath: repository.path(recordId, asset.relativePath), success: () => resolve(), fail: reject }));
        repository.edit(recordId, record => {
          const group = record.groups.find(g => g.id === groupId);
          if (!group) throw new Error('费用组已不存在');
          record.assets[id] = asset;
          group[role].push(id);
        });
      } catch (error) {
        const message = (error as { message?: string; errMsg?: string }).message || (error as { errMsg?: string }).errMsg || '保存失败';
        errors.push(`${file.name}：${message}`);
      }
    }
  } finally { wx.hideLoading(); }
  if (errors.length) throw new Error(`已保存的材料会保留。以下材料需要重新选择：\n${errors.join('\n')}`);
}
