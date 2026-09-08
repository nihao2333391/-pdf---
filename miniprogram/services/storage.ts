import { Repository } from '../core/repository';
const fs = wx.getFileSystemManager();
export const repository = new Repository({
  mkdir(path) { try { fs.accessSync(path); } catch { fs.mkdirSync(path, true); } },
  readText(path) { return fs.readFileSync(path, 'utf8') as string; },
  writeText(path, text) { fs.writeFileSync(path, text, 'utf8'); },
  copy(from, to) { fs.copyFileSync(from, to); },
  rename(from, to) { fs.renameSync(from, to); },
  list(path) { return fs.readdirSync(path); },
  exists(path) { try { fs.accessSync(path); return true; } catch { return false; } },
}, `${wx.env.USER_DATA_PATH}/reimbursements`);

export function readBytes(path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => fs.readFile({ filePath: path, success: r => resolve(new Uint8Array(r.data as ArrayBuffer)), fail: reject }));
}
export function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => fs.writeFile({ filePath: path, data, success: () => resolve(), fail: reject }));
}
export function ensureDirectory(path: string): void {
  try { fs.accessSync(path); } catch { fs.mkdirSync(path, true); }
}
