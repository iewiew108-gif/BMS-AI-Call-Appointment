// TalkMateAI / MedAI Screen — video call session management
// API base: https://medai-screen.bmscloud.in.th

const MEDAI_BASE = 'https://medai-screen.bmscloud.in.th';
const JITSI_BASE = 'https://meet.jit.si';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MedAiStartRequest {
  patient_id: string;
  jitsi_url: string;
  locale?: string;
  patient_payload?: {
    name?: string | null;
    age?: number | null;
    sex?: string | null;
    chief_complaint?: string | null;
    notes?: string | null;
  };
  session_id?: string | null;
}

export interface MedAiStartResponse {
  session_id: string;
  sse_url: string;
  transcript_url: string;
  end_url: string;
  consent_prompt: string;
  patient_jitsi_url: string | null;
  observer_jitsi_url: string | null;
}

export interface MedAiSessionEvent {
  type: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Session storage key
// ---------------------------------------------------------------------------

const SESSION_LOG_KEY = 'bms.aiconfirm.medAiSessions.v1';

export interface MedAiCallRecord {
  id: string;
  an: string;
  hn: string;
  patientName: string;
  sessionId: string;
  jitsiRoomUrl: string;
  observerUrl: string | null;
  patientUrl: string | null;
  sseUrl: string;
  transcriptUrl: string;
  endUrl: string;
  startedAt: string;   // ISO
  endedAt?: string;
  status: 'active' | 'ended' | 'error';
  errorMessage?: string;
}

function readRecords(): MedAiCallRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_LOG_KEY);
    return raw ? (JSON.parse(raw) as MedAiCallRecord[]) : [];
  } catch {
    return [];
  }
}

let recordSnapshot: MedAiCallRecord[] = readRecords();

function writeRecords(records: MedAiCallRecord[]): void {
  localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(records));
  recordSnapshot = records;
  listeners.forEach((fn) => fn());
}

const listeners = new Set<() => void>();

export function subscribeMedAiCalls(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMedAiCallRecords(): MedAiCallRecord[] { return recordSnapshot; }

export function getMedAiCallsForAn(an: string): MedAiCallRecord[] {
  return recordSnapshot.filter((r) => r.an === an);
}

export function getActiveSessionForAn(an: string): MedAiCallRecord | null {
  return recordSnapshot.find((r) => r.an === an && r.status === 'active') ?? null;
}

export function endMedAiSession(id: string): void {
  const all = readRecords().map((r) =>
    r.id === id ? { ...r, status: 'ended' as const, endedAt: new Date().toISOString() } : r,
  );
  writeRecords(all);
}

export function deleteMedAiRecord(id: string): void {
  writeRecords(readRecords().filter((r) => r.id !== id));
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Generate a unique Jitsi room URL for a patient AN */
export function generateJitsiRoomUrl(an: string): string {
  const room = `BMS-PostOp-${an}-${Date.now()}`;
  return `${JITSI_BASE}/${room}`;
}

/** Start a TalkMateAI session and return the session data */
export async function startMedAiSession(
  an: string,
  hn: string,
  patientName: string,
  patientPayload?: MedAiStartRequest['patient_payload'],
): Promise<MedAiCallRecord> {
  const jitsiRoomUrl = generateJitsiRoomUrl(an);

  const body: MedAiStartRequest = {
    patient_id: hn,
    jitsi_url: jitsiRoomUrl,
    locale: 'th',
    patient_payload: patientPayload ?? undefined,
  };

  const res = await fetch(`${MEDAI_BASE}/api/v1/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`MedAI API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as MedAiStartResponse;

  const record: MedAiCallRecord = {
    id:           `medai_${an}_${Date.now()}`,
    an,
    hn,
    patientName,
    sessionId:    data.session_id,
    jitsiRoomUrl,
    observerUrl:  data.observer_jitsi_url,
    patientUrl:   data.patient_jitsi_url,
    sseUrl:       `${MEDAI_BASE}${data.sse_url}`,
    transcriptUrl:`${MEDAI_BASE}${data.transcript_url}`,
    endUrl:       `${MEDAI_BASE}${data.end_url}`,
    startedAt:    new Date().toISOString(),
    status:       'active',
  };

  writeRecords([...readRecords(), record]);
  return record;
}

/** Call the end session API */
export async function endMedAiSessionApi(record: MedAiCallRecord): Promise<void> {
  await fetch(record.endUrl, { method: 'POST' }).catch(() => null);
  endMedAiSession(record.id);
}
