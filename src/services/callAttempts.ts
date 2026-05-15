// =============================================================================
// Local call-attempt store
//
// Tracks the AI confirm-call lifecycle for each One Day Case appointment.
// HOSxP `oapp` has its own `oapp_status_id` we won't overwrite — instead we
// keep the call status in app memory (with a localStorage mirror so nurse
// shift handovers don't lose progress on a browser refresh).
//
// Subscribers are notified on every change so React components can re-render
// via a simple `useSyncExternalStore`-style hook.
// =============================================================================

import type { CallAttempt, CallStatus } from '@/types/appointment';

/** localStorage key — namespaced with the app id so it doesn't collide. */
export const CALL_ATTEMPTS_STORAGE_KEY = 'bms.aiconfirm.callAttempts.v1';

// ---------------------------------------------------------------------------
// Module-private state
// ---------------------------------------------------------------------------

const store: Map<number, CallAttempt> = new Map();
const listeners: Set<() => void> = new Set();

function nowIso(): string {
  return new Date().toISOString();
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      // Don't let one bad listener block the others.
      console.error('[callAttempts] listener threw:', err);
    }
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const rows = Array.from(store.values());
    localStorage.setItem(CALL_ATTEMPTS_STORAGE_KEY, JSON.stringify(rows));
  } catch (err) {
    // Quota exceeded or disabled — log but don't crash the UI.
    console.warn('[callAttempts] failed to persist:', err);
  }
}

function loadFromStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(CALL_ATTEMPTS_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Partial<CallAttempt>;
      if (typeof e.oappId !== 'number' || typeof e.status !== 'string') continue;
      store.set(e.oappId, {
        oappId: e.oappId,
        status: e.status as CallStatus,
        attempts: typeof e.attempts === 'number' ? e.attempts : 1,
        updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : nowIso(),
        caseId: typeof e.caseId === 'string' ? e.caseId : undefined,
        reason: typeof e.reason === 'string' ? e.reason : undefined,
      });
    }
  } catch {
    // Corrupt payload — leave the in-memory store as-is.
  }
}

// Lazy-load on first import so subscribers can attach before data arrives.
loadFromStorage();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Look up the call-attempt for one appointment. */
export function getCallAttempt(oappId: number): CallAttempt | undefined {
  return store.get(oappId);
}

/** Snapshot of every stored attempt — safe to iterate in React renderers. */
export function getAllCallAttempts(): CallAttempt[] {
  return Array.from(store.values());
}

/** Input shape for `upsertCallAttempt`. */
export interface UpsertCallAttemptInput {
  oappId: number;
  status: CallStatus;
  caseId?: string;
  reason?: string;
}

/**
 * Insert or update a call-attempt. The `attempts` counter is bumped only when
 * the status actually changes — repeated `queued → queued` doesn't inflate it.
 * Returns the resulting record so callers can echo it back to the UI.
 */
export function upsertCallAttempt(input: UpsertCallAttemptInput): CallAttempt {
  const existing = store.get(input.oappId);
  const statusChanged = !existing || existing.status !== input.status;

  const next: CallAttempt = {
    oappId: input.oappId,
    status: input.status,
    attempts: (existing?.attempts ?? 0) + (statusChanged ? 1 : 0),
    updatedAt: nowIso(),
    caseId: input.caseId !== undefined ? input.caseId : existing?.caseId,
    reason: input.reason !== undefined ? input.reason : existing?.reason,
  };

  // When this is the very first time we see this oapp_id and the caller
  // didn't change the status, `statusChanged` is true because `existing` is
  // undefined — so `attempts` becomes 1. Good.

  store.set(input.oappId, next);
  persist();
  notify();
  return next;
}

/** Reset everything — used in tests and on "เลิกใช้ feature" workflows. */
export function clearCallAttempts(): void {
  store.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(CALL_ATTEMPTS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

/** Subscribe to changes. Returns the unsubscribe function. */
export function subscribeCallAttempts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Force a re-read from localStorage — used by tests and on cross-tab sync. */
export function reloadCallAttemptsFromStorage(): void {
  store.clear();
  loadFromStorage();
  notify();
}
