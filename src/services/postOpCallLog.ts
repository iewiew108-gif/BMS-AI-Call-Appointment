// =============================================================================
// PostOpCallLog — Local-first store สำหรับบันทึกการโทรติดตามหลังผ่าตัด
// Key: bms.aiconfirm.postOpCallLog.v1
// =============================================================================

import type { PostOpCallEntry, PostOpCallResult } from '@/types/postOpCall';

const STORAGE_KEY = 'bms.aiconfirm.postOpCallLog.v1';

const store: Map<string, PostOpCallEntry[]> = new Map(); // an → entries[]
const listeners: Set<() => void> = new Set();
let snapshotCache: PostOpCallEntry[] | null = null;

function invalidate(): void { snapshotCache = null; }
function nowIso(): string { return new Date().toISOString(); }

function notifyAll(): void {
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  const all: PostOpCallEntry[] = [];
  for (const entries of store.values()) all.push(...entries);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* quota */ }
}

function load(): void {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (item && typeof item === 'object' && 'an' in item) {
        const entry = item as PostOpCallEntry;
        if (!store.has(entry.an)) store.set(entry.an, []);
        store.get(entry.an)!.push(entry);
      }
    }
  } catch { /* corrupt */ }
}

load();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllPostOpCallEntries(): PostOpCallEntry[] {
  if (snapshotCache === null) {
    const all: PostOpCallEntry[] = [];
    for (const entries of store.values()) all.push(...entries);
    snapshotCache = all.sort(
      (a, b) => new Date(b.callDate).getTime() - new Date(a.callDate).getTime(),
    );
  }
  return snapshotCache;
}

export function getCallEntriesForAn(an: string): PostOpCallEntry[] {
  return (store.get(an) ?? []).sort(
    (a, b) => new Date(b.callDate).getTime() - new Date(a.callDate).getTime(),
  );
}

export function addPostOpCallEntry(
  an: string,
  hn: string,
  callResult: PostOpCallResult,
  note: string,
  calledBy: string,
): PostOpCallEntry {
  const entry: PostOpCallEntry = {
    id: `poc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    an, hn,
    callDate: nowIso(),
    callResult,
    note: note.trim(),
    calledBy: calledBy.trim(),
  };
  if (!store.has(an)) store.set(an, []);
  store.get(an)!.push(entry);
  invalidate();
  persist();
  notifyAll();
  return entry;
}

export function deletePostOpCallEntry(id: string): void {
  for (const [an, entries] of store.entries()) {
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length !== entries.length) {
      store.set(an, filtered);
      invalidate();
      persist();
      notifyAll();
      return;
    }
  }
}

export function subscribePostOpCallLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** สถานะล่าสุดของแต่ละ AN */
export function getLatestCallResultForAn(an: string): PostOpCallResult | null {
  const entries = store.get(an);
  if (!entries || entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(b.callDate).getTime() - new Date(a.callDate).getTime(),
  );
  return sorted[0].callResult;
}
