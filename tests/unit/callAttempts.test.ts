// =============================================================================
// Tests — src/services/callAttempts.ts
//
// The call-attempt store lives in app memory (mirrored to localStorage) so
// the dashboard can track AI confirm-call lifecycle independently of HOSxP.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCallAttempt,
  getAllCallAttempts,
  upsertCallAttempt,
  clearCallAttempts,
  subscribeCallAttempts,
  CALL_ATTEMPTS_STORAGE_KEY,
  reloadCallAttemptsFromStorage,
} from '@/services/callAttempts';

beforeEach(() => {
  // Reset both in-memory store and the persistent backing.
  globalThis.localStorage?.clear?.();
  clearCallAttempts();
});

describe('callAttempts — basic CRUD', () => {
  it('returns undefined for an unknown oapp_id', () => {
    expect(getCallAttempt(404)).toBeUndefined();
  });

  it('returns an empty array when nothing has been stored', () => {
    expect(getAllCallAttempts()).toEqual([]);
  });

  it('upsert creates a new entry with attempts=1 and an ISO updatedAt', () => {
    const r = upsertCallAttempt({ oappId: 10, status: 'queued' });
    expect(r.oappId).toBe(10);
    expect(r.status).toBe('queued');
    expect(r.attempts).toBe(1);
    expect(new Date(r.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('upsert returns the same logical record on subsequent reads', () => {
    upsertCallAttempt({ oappId: 11, status: 'queued' });
    const fetched = getCallAttempt(11);
    expect(fetched?.status).toBe('queued');
    expect(fetched?.attempts).toBe(1);
  });

  it('upsert bumps attempts only when the status actually changes', () => {
    const a = upsertCallAttempt({ oappId: 12, status: 'queued' });
    const b = upsertCallAttempt({ oappId: 12, status: 'queued' });
    const c = upsertCallAttempt({ oappId: 12, status: 'calling' });
    expect(a.attempts).toBe(1);
    expect(b.attempts).toBe(1); // same status — no bump
    expect(c.attempts).toBe(2); // status changed — bump
  });

  it('upsert preserves caseId / reason when not supplied in a partial update', () => {
    upsertCallAttempt({
      oappId: 13,
      status: 'calling',
      caseId: 'case-abc',
      reason: 'initial call',
    });
    const updated = upsertCallAttempt({ oappId: 13, status: 'confirmed' });
    expect(updated.caseId).toBe('case-abc');
    expect(updated.reason).toBe('initial call');
  });

  it('upsert overrides caseId / reason when explicitly supplied', () => {
    upsertCallAttempt({ oappId: 14, status: 'calling', caseId: 'old' });
    const updated = upsertCallAttempt({
      oappId: 14,
      status: 'escalated',
      reason: 'patient unclear',
      caseId: 'new',
    });
    expect(updated.caseId).toBe('new');
    expect(updated.reason).toBe('patient unclear');
  });

  it('getAllCallAttempts returns every stored row', () => {
    upsertCallAttempt({ oappId: 1, status: 'queued' });
    upsertCallAttempt({ oappId: 2, status: 'confirmed' });
    const rows = getAllCallAttempts();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.oappId).sort()).toEqual([1, 2]);
  });

  it('clearCallAttempts wipes both memory and localStorage', () => {
    upsertCallAttempt({ oappId: 5, status: 'queued' });
    expect(getAllCallAttempts()).toHaveLength(1);
    clearCallAttempts();
    expect(getAllCallAttempts()).toEqual([]);
    expect(localStorage.getItem(CALL_ATTEMPTS_STORAGE_KEY)).toBeNull();
  });
});

describe('callAttempts — subscriptions', () => {
  it('notifies subscribers on upsert', () => {
    const listener = vi.fn();
    const off = subscribeCallAttempts(listener);
    upsertCallAttempt({ oappId: 20, status: 'queued' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not notify after unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeCallAttempts(listener);
    off();
    upsertCallAttempt({ oappId: 21, status: 'queued' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers on clear', () => {
    upsertCallAttempt({ oappId: 22, status: 'queued' });
    const listener = vi.fn();
    const off = subscribeCallAttempts(listener);
    clearCallAttempts();
    expect(listener).toHaveBeenCalled();
    off();
  });
});

describe('callAttempts — localStorage persistence', () => {
  it('persists writes to localStorage', () => {
    upsertCallAttempt({ oappId: 30, status: 'confirmed' });
    const raw = localStorage.getItem(CALL_ATTEMPTS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Array<{ oappId: number; status: string }>;
    expect(parsed.find((p) => p.oappId === 30)?.status).toBe('confirmed');
  });

  it('reloads previously-persisted data on demand', () => {
    localStorage.setItem(
      CALL_ATTEMPTS_STORAGE_KEY,
      JSON.stringify([
        { oappId: 40, status: 'confirmed', attempts: 2, updatedAt: '2026-05-01T10:00:00.000Z' },
      ]),
    );
    reloadCallAttemptsFromStorage();
    expect(getCallAttempt(40)?.status).toBe('confirmed');
    expect(getCallAttempt(40)?.attempts).toBe(2);
  });

  it('ignores corrupt localStorage payloads without throwing', () => {
    localStorage.setItem(CALL_ATTEMPTS_STORAGE_KEY, '{not json');
    expect(() => reloadCallAttemptsFromStorage()).not.toThrow();
    expect(getAllCallAttempts()).toEqual([]);
  });
});
