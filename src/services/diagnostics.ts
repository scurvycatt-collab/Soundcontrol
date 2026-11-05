// Nhật ký file mồ côi trên Storage (khi rollback/xóa thất bại) để admin dọn thủ công.
const KEY = 'stageAudio.orphans.v1';

export interface OrphanRecord {
  path: string;
  at: number;
  reason: string;
}

function read(): OrphanRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OrphanRecord[]) : [];
  } catch {
    return [];
  }
}

function write(list: OrphanRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* localStorage có thể bị chặn; vẫn có console.error */
  }
}

export function recordOrphan(path: string, reason: string): void {
  console.error('[orphan] File Storage có thể bị mồ côi:', path, reason);
  const list = read().filter((o) => o.path !== path);
  list.push({ path, at: Date.now(), reason });
  write(list);
}

export function listOrphans(): OrphanRecord[] {
  return read();
}

export function clearOrphan(path: string): void {
  write(read().filter((o) => o.path !== path));
}
