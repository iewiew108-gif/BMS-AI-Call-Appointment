// =============================================================================
// Urgent Callbacks Store
// Local-first store (localStorage) for urgent patient callback requests.
// Designed for registration desk → nurse workflow.
// =============================================================================

import type { UrgentCallbackRequest, UrgentCallbackStatus, UrgentCallbackPriority } from '@/types/urgentCallback';

const STORAGE_KEY = 'bms.aiconfirm.urgentCallbacks.v1';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const store: Map<string, UrgentCallbackRequest> = new Map();
const listeners: Set<() => void> = new Set();
let snapshotCache: UrgentCallbackRequest[] | null = null;

function invalidate(): void { snapshotCache = null; }
function nowIso(): string { return new Date().toISOString(); }

function notifyAll(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(store.values())));
  } catch { /* quota exceeded */ }
}

function load(): void {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (item && typeof item === 'object' && 'id' in item) {
        store.set((item as UrgentCallbackRequest).id, item as UrgentCallbackRequest);
      }
    }
  } catch { /* corrupt */ }
}

load();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllUrgentCallbacks(): UrgentCallbackRequest[] {
  if (snapshotCache === null) {
    snapshotCache = Array.from(store.values()).sort(
      (a, b) => {
        // critical first, then by date desc
        if (a.priority !== b.priority) return a.priority === 'critical' ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      },
    );
  }
  return snapshotCache;
}

export function getUrgentCallbackById(id: string): UrgentCallbackRequest | undefined {
  return store.get(id);
}

export interface CreateUrgentCallbackInput {
  hn: string;
  patientName: string;
  phone: string;
  reason: string;
  priority: UrgentCallbackPriority;
  ward: string;
}

export function createUrgentCallback(input: CreateUrgentCallbackInput): UrgentCallbackRequest {
  const id = `ucb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = nowIso();
  const record: UrgentCallbackRequest = {
    id,
    hn: input.hn.trim(),
    patientName: input.patientName.trim(),
    phone: input.phone.trim(),
    reason: input.reason.trim(),
    priority: input.priority,
    ward: input.ward.trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  store.set(id, record);
  invalidate();
  persist();
  notifyAll();
  return record;
}

export function updateUrgentCallbackStatus(
  id: string,
  status: UrgentCallbackStatus,
  opts?: { resolvedBy?: string; resolvedNote?: string },
): UrgentCallbackRequest | undefined {
  const existing = store.get(id);
  if (!existing) return undefined;
  const updated: UrgentCallbackRequest = {
    ...existing,
    status,
    updatedAt: nowIso(),
    resolvedBy: opts?.resolvedBy ?? existing.resolvedBy,
    resolvedNote: opts?.resolvedNote ?? existing.resolvedNote,
  };
  store.set(id, updated);
  invalidate();
  persist();
  notifyAll();
  return updated;
}

export function deleteUrgentCallback(id: string): void {
  store.delete(id);
  invalidate();
  persist();
  notifyAll();
}

export function subscribeUrgentCallbacks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingCount(): number {
  return Array.from(store.values()).filter(
    (r) => r.status === 'pending' || r.status === 'in_progress',
  ).length;
}
