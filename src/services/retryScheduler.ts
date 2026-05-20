// =============================================================================
// Retry Scheduler — โทรซ้ำอัตโนมัติทุก 30 นาที
//
// Watches the callAttempts store for `no_answer` entries and schedules a retry
// 30 minutes after the last attempt. Callbacks registered via
// `registerRetryHandler` are invoked when a retry fires.
// =============================================================================

import { getAllCallAttempts, subscribeCallAttempts } from '@/services/callAttempts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const TICK_INTERVAL_MS = 30_000; // check every 30 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledRetry {
  oappId: number;
  scheduledAt: string; // ISO — when the no_answer was recorded
  retryAt: string;     // ISO — scheduledAt + 30 min
  attempts: number;
}

export type RetryHandler = (oappId: number) => Promise<void> | void;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const scheduled: Map<number, ScheduledRetry> = new Map();
const stateListeners: Set<() => void> = new Set();
const retryHandlers: Set<RetryHandler> = new Set();

let tickTimer: ReturnType<typeof setInterval> | null = null;
let enabled = true;
let snapshotCache: ScheduledRetry[] | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function invalidate(): void {
  snapshotCache = null;
}

function notifyStateListeners(): void {
  for (const fn of stateListeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

function syncFromCallAttempts(): void {
  const attempts = getAllCallAttempts();
  let changed = false;

  for (const attempt of attempts) {
    if (attempt.status === 'no_answer') {
      if (!scheduled.has(attempt.oappId)) {
        const scheduledAt = attempt.updatedAt;
        const retryAt = new Date(new Date(scheduledAt).getTime() + RETRY_INTERVAL_MS).toISOString();
        scheduled.set(attempt.oappId, {
          oappId: attempt.oappId,
          scheduledAt,
          retryAt,
          attempts: attempt.attempts,
        });
        changed = true;
      }
    } else {
      // If status changed away from no_answer, remove from scheduler
      if (scheduled.has(attempt.oappId)) {
        scheduled.delete(attempt.oappId);
        changed = true;
      }
    }
  }

  // Remove entries whose oappId no longer exists in callAttempts
  const activeIds = new Set(attempts.map((a) => a.oappId));
  for (const id of scheduled.keys()) {
    if (!activeIds.has(id)) {
      scheduled.delete(id);
      changed = true;
    }
  }

  if (changed) {
    invalidate();
    notifyStateListeners();
  }
}

async function tick(): Promise<void> {
  if (!enabled) return;

  const now = Date.now();
  const due: ScheduledRetry[] = [];

  for (const entry of scheduled.values()) {
    if (new Date(entry.retryAt).getTime() <= now) {
      due.push(entry);
    }
  }

  for (const entry of due) {
    // Remove from scheduled (will be re-added if still no_answer after retry)
    scheduled.delete(entry.oappId);
    invalidate();
    notifyStateListeners();

    for (const handler of retryHandlers) {
      try {
        await handler(entry.oappId);
      } catch (err) {
        console.error('[retryScheduler] handler threw for oappId', entry.oappId, err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Snapshot of all currently scheduled retries. */
export function getScheduledRetries(): ScheduledRetry[] {
  if (snapshotCache === null) {
    snapshotCache = Array.from(scheduled.values());
  }
  return snapshotCache;
}

/** Whether auto-retry is enabled. */
export function isRetryEnabled(): boolean {
  return enabled;
}

/** Enable / disable auto-retry without stopping the tick. */
export function setRetryEnabled(value: boolean): void {
  enabled = value;
  notifyStateListeners();
}

/** Subscribe to scheduler state changes. Returns unsubscribe. */
export function subscribeRetryScheduler(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/**
 * Register a handler that will be called when a retry fires.
 * Returns unregister function.
 */
export function registerRetryHandler(handler: RetryHandler): () => void {
  retryHandlers.add(handler);
  return () => retryHandlers.delete(handler);
}

/** Start the scheduler — idempotent. */
export function startRetryScheduler(): void {
  if (tickTimer !== null) return;

  syncFromCallAttempts();
  const unsubscribeAttempts = subscribeCallAttempts(syncFromCallAttempts);

  tickTimer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);

  // Store unsubscribe so stopRetryScheduler can clean up
  (startRetryScheduler as { _unsub?: () => void })._unsub = unsubscribeAttempts;
}

/** Stop the scheduler and clean up. */
export function stopRetryScheduler(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  const fn = (startRetryScheduler as { _unsub?: () => void })._unsub;
  if (fn) { fn(); delete (startRetryScheduler as { _unsub?: () => void })._unsub; }
}

/** Manually trigger a check (useful in tests / dev). */
export function triggerRetryCheck(): Promise<void> {
  return tick();
}

/** Returns ms remaining until the next scheduled retry (or null if none). */
export function msUntilNextRetry(): number | null {
  let earliest: number | null = null;
  for (const entry of scheduled.values()) {
    const t = new Date(entry.retryAt).getTime();
    if (earliest === null || t < earliest) earliest = t;
  }
  if (earliest === null) return null;
  return Math.max(0, earliest - Date.now());
}
