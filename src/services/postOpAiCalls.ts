// localStorage store for post-op AI call records (AIDX-based)

import type { EnqueueConfirmCallResult } from '@/services/aidx';

export type PostOpAiCallStatus =
  | 'queued'
  | 'calling'
  | 'confirmed'
  | 'no_answer'
  | 'escalated'
  | 'cancelled'
  | 'error'
  | 'ended';

export type PostOpNurseFlag =
  | 'normal'
  | 'abnormal'
  | 'needs_followup'
  | 'booked_doctor';

export interface PostOpAiCallRecord {
  id: string;
  an: string;
  hn: string;
  patientName: string;
  caseId: string;
  status: PostOpAiCallStatus;
  joinUrl: string | null;
  patientJitsiUrl: string | null;
  eventsUrl: string | null;
  startedAt: string;
  endedAt?: string;
  transcript: string[];
  nurseFlag?: PostOpNurseFlag | null;
  nurseFlagNote?: string;
  nurseFlaggedAt?: string;
}

const STORAGE_KEY = 'bms.aiconfirm.postOpAiCalls.v1';

const TERMINAL: ReadonlySet<PostOpAiCallStatus> = new Set([
  'confirmed', 'no_answer', 'escalated', 'cancelled', 'error', 'ended',
]);

function readRecords(): PostOpAiCallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PostOpAiCallRecord[]) : [];
  } catch {
    return [];
  }
}

let snapshot: PostOpAiCallRecord[] = readRecords();
const listeners = new Set<() => void>();

function write(records: PostOpAiCallRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  snapshot = records;
  listeners.forEach((fn) => fn());
}

export function subscribePostOpAiCalls(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAllPostOpAiCallRecords(): PostOpAiCallRecord[] { return snapshot; }

export function getPostOpAiCallsForAn(an: string): PostOpAiCallRecord[] {
  return snapshot.filter((r) => r.an === an);
}

export function getActiveAiCallForAn(an: string): PostOpAiCallRecord | null {
  return (
    snapshot.find((r) => r.an === an && (r.status === 'queued' || r.status === 'calling')) ?? null
  );
}

export function getLatestAiCallForAn(an: string): PostOpAiCallRecord | null {
  const sorted = snapshot
    .filter((r) => r.an === an)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return sorted[0] ?? null;
}

export function createPostOpAiCallRecord(
  an: string,
  hn: string,
  patientName: string,
  result: EnqueueConfirmCallResult,
): PostOpAiCallRecord {
  const record: PostOpAiCallRecord = {
    id: `postop_ai_${an}_${Date.now()}`,
    an,
    hn,
    patientName,
    caseId: result.caseId,
    status: (result.status as PostOpAiCallStatus) ?? 'queued',
    joinUrl: result.joinUrl ?? null,
    patientJitsiUrl: result.patientJitsiUrl ?? null,
    eventsUrl: result.eventsUrl ?? null,
    startedAt: new Date().toISOString(),
    transcript: [],
  };
  write([...readRecords(), record]);
  return record;
}

export function updatePostOpAiCallStatus(id: string, status: PostOpAiCallStatus): void {
  write(
    readRecords().map((r) =>
      r.id === id
        ? {
            ...r,
            status,
            endedAt: TERMINAL.has(status)
              ? (r.endedAt ?? new Date().toISOString())
              : r.endedAt,
          }
        : r,
    ),
  );
}

export function appendPostOpAiTranscript(id: string, chunk: string): void {
  write(
    readRecords().map((r) =>
      r.id === id ? { ...r, transcript: [...r.transcript, chunk] } : r,
    ),
  );
}

export function deletePostOpAiCallRecord(id: string): void {
  write(readRecords().filter((r) => r.id !== id));
}

export function setNurseFlag(
  id: string,
  flag: PostOpNurseFlag | null,
  note?: string,
): void {
  write(
    readRecords().map((r) =>
      r.id === id
        ? {
            ...r,
            nurseFlag: flag,
            nurseFlagNote: note !== undefined ? note : r.nurseFlagNote,
            nurseFlaggedAt: new Date().toISOString(),
          }
        : r,
    ),
  );
}
