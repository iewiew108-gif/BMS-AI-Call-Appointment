// =============================================================================
// medai-screen (AIDX) integration — Dynamic Task API v1
//
// Outbound integrations for the AI confirm-call workflow using the correct
// /api/v1/dynamic-task/* endpoints:
//
//   enqueueConfirmCall    — generate task spec → start session (two-step)
//   getCaseStatus         — GET /api/v1/dynamic-task/{reference_id}
//   subscribeCaseEvents   — SSE  GET /api/v1/dynamic-task/{reference_id}/events
//   sendMorPhromConfirmInvite — wraps moph.ts for LINE Flex delivery
//
// reference_id is caller-supplied as "oapp-{oappId}" for traceability.
// =============================================================================

import {
  buildMophFlexBubble,
  sendMophNotification,
  validateMophCid,
} from '@/services/moph';
import type { MophSendResult } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL for the AIDX REST + SSE API. */
export const AIDX_API_BASE = 'https://medai-screen-api.bmscloud.in.th';

/** Per-request timeout for generate / start / status fetches (ms). */
export const AIDX_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface EnqueueConfirmCallInput {
  oappId: number;
  cid: string;
  hn: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string | null;
  clinicName: string | null;
  doctorName: string | null;
  operationNote: string | null;
  preparationNotes: string | null;
  contactPhone: string | null;
  preferredLang?: 'th' | 'en';
  /** Hospital display name forwarded to MohPrompt videocall config. */
  hospitalName?: string;
  /** Hospital code (hospcode / hcode9) for MohPrompt. */
  hospcode?: string;
}

export interface AidxCallOptions {
  /** Override the default `AIDX_API_BASE`. */
  baseUrl?: string;
  /** Bearer token sent on every request. */
  apiToken?: string;
  /** AbortSignal forwarded to fetch. */
  signal?: AbortSignal;
}

export interface EnqueueConfirmCallResult {
  /** Caller-supplied reference id ("oapp-{oappId}"). Maps to `reference_id`. */
  caseId: string;
  status: string;
  /** Jitsi URL for the **nurse** to join and monitor the AI call. */
  joinUrl?: string;
  /** Jitsi URL for the **patient** — embed in LINE Flex or share as link. */
  patientJitsiUrl?: string;
  /** SSE events URL for transcript streaming. */
  eventsUrl?: string;
  raw: unknown;
}

export interface CaseStatusResult {
  caseId: string;
  status: string;
  attempts?: number;
  raw: unknown;
}

export interface CaseEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface CaseEventHandlers {
  onStatus?: (status: string) => void;
  onTranscript?: (chunk: string) => void;
  onEvent?: (event: CaseEvent) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export interface SubscribeCaseEventsOptions extends AidxCallOptions {
  /** Test injection point — defaults to the global `EventSource`. */
  EventSourceCtor?: typeof EventSource;
}

// ---------------------------------------------------------------------------
// AIDX API response shapes (Dynamic Task)
// ---------------------------------------------------------------------------

interface DynamicTaskSpec {
  title: string;
  instruction: string;
  expected_outcomes: string[];
}

interface DynamicTaskGenerateResponse {
  task: DynamicTaskSpec;
}

interface DynamicTaskStartResponse {
  reference_id: string;
  session_id?: string;
  status?: string;
  status_url?: string;
  events_url?: string;
  jitsi_url?: string;
  patient_jitsi_url?: string;
}

interface DynamicTaskStatusResponse {
  reference_id?: string;
  status?: string;
  attempts?: number;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function aidxFetch(
  path: string,
  init: RequestInit,
  options?: AidxCallOptions,
): Promise<Response> {
  const base = options?.baseUrl ?? AIDX_API_BASE;
  const url = `${base}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AIDX_TIMEOUT_MS);
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort());
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (options?.apiToken) headers['Authorization'] = `Bearer ${options.apiToken}`;

  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// enqueueConfirmCall — two-step: generate → start
// ---------------------------------------------------------------------------

/**
 * Submit a new confirm-call session to the AIDX engine via the Dynamic Task
 * API:
 *   1. POST /api/v1/dynamic-task/generate — build the task spec from context
 *   2. POST /api/v1/dynamic-task/start    — start the session
 *
 * reference_id is set to "oapp-{oappId}" so every session is traceable back
 * to its HOSxP appointment record.
 *
 * @throws {Error} On CID validation, network error, or non-2xx response.
 */
export async function enqueueConfirmCall(
  input: EnqueueConfirmCallInput,
  options?: AidxCallOptions,
): Promise<EnqueueConfirmCallResult> {
  validateMophCid(input.cid);

  const referenceId = `oapp-${input.oappId}`;
  const locale = input.preferredLang ?? 'th';

  // Step 1: Generate a task spec from the appointment context
  const generateBody = {
    task_prompt:
      `ยืนยันนัดหมายผ่าตัดกับผู้ป่วย ${input.patientName} สำหรับวันที่ ${input.appointmentDate}` +
      (input.clinicName ? ` ที่คลินิก ${input.clinicName}` : '') +
      (input.doctorName ? ` แพทย์ ${input.doctorName}` : '') +
      (input.operationNote ? ` รายการ: ${input.operationNote}` : ''),
    context: {
      oapp_id: input.oappId,
      hn: input.hn,
      patient_name: input.patientName,
      appointment_date: input.appointmentDate,
      appointment_time: input.appointmentTime,
      clinic_name: input.clinicName,
      doctor_name: input.doctorName,
      operation_note: input.operationNote,
      preparation_notes: input.preparationNotes,
      contact_phone: input.contactPhone,
    },
    locale,
  };

  const genResponse = await aidxFetch(
    '/api/v1/dynamic-task/generate',
    { method: 'POST', body: JSON.stringify(generateBody) },
    options,
  );

  if (!genResponse.ok) {
    const text = await genResponse.text().catch(() => '');
    throw new Error(
      `AIDX generate failed (HTTP ${genResponse.status}): ${text.slice(0, 200)}`,
    );
  }

  const genParsed = (await genResponse.json()) as DynamicTaskGenerateResponse;

  if (!genParsed.task) {
    throw new Error('AIDX generate returned no task spec');
  }

  // Step 2: Start the task session
  const startBody = {
    reference_id: referenceId,
    cid: input.cid,
    patient_id: input.hn,
    locale,
    task: genParsed.task,
    videocall: {
      provider: 'mohprompt',
      cid: input.cid,
      hospital: {
        hospcode: input.hospcode ?? null,
        hospital_name: input.hospitalName ?? 'โรงพยาบาล',
      },
      clinic_code: '099',
      clinic_name: input.clinicName ?? 'telemed',
    },
  };

  const startResponse = await aidxFetch(
    '/api/v1/dynamic-task/start',
    { method: 'POST', body: JSON.stringify(startBody) },
    options,
  );

  if (!startResponse.ok) {
    const text = await startResponse.text().catch(() => '');
    throw new Error(
      `AIDX start failed (HTTP ${startResponse.status}): ${text.slice(0, 200)}`,
    );
  }

  const startParsed = (await startResponse.json()) as DynamicTaskStartResponse;

  return {
    caseId: startParsed.reference_id ?? referenceId,
    status: startParsed.status ?? 'queued',
    joinUrl: startParsed.jitsi_url,
    patientJitsiUrl: startParsed.patient_jitsi_url,
    eventsUrl: startParsed.events_url,
    raw: startParsed,
  };
}

// ---------------------------------------------------------------------------
// getCaseStatus
// ---------------------------------------------------------------------------

/** GET the current status of a dynamic task by its reference_id. */
export async function getCaseStatus(
  caseId: string,
  options?: AidxCallOptions,
): Promise<CaseStatusResult> {
  const response = await aidxFetch(
    `/api/v1/dynamic-task/${encodeURIComponent(caseId)}`,
    { method: 'GET' },
    options,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `AIDX status failed (HTTP ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const parsed = (await response.json()) as DynamicTaskStatusResponse;
  return {
    caseId: parsed.reference_id ?? caseId,
    status: parsed.status ?? 'unknown',
    attempts: parsed.attempts,
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// subscribeCaseEvents — SSE
// ---------------------------------------------------------------------------

/**
 * Open an SSE stream to the dynamic task event feed.
 * URL: GET /api/v1/dynamic-task/{reference_id}/events
 *
 * Returns an unsubscribe function that closes the underlying stream.
 */
export function subscribeCaseEvents(
  caseId: string,
  handlers: CaseEventHandlers,
  options?: SubscribeCaseEventsOptions,
): () => void {
  const base = options?.baseUrl ?? AIDX_API_BASE;
  const url = `${base}/api/v1/dynamic-task/${encodeURIComponent(caseId)}/events`;
  const Ctor = options?.EventSourceCtor ?? (globalThis as { EventSource?: typeof EventSource }).EventSource;
  if (!Ctor) {
    handlers.onError?.(new Error('EventSource is not available in this environment.'));
    return () => {};
  }

  const source = new Ctor(url) as EventSource & {
    addEventListener: EventSource['addEventListener'];
  };

  const safeJson = (raw: string): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };

  const onStatus = (e: MessageEvent): void => {
    if (!handlers.onStatus) return;
    const payload = safeJson(String(e.data ?? ''));
    if (typeof payload.status === 'string') handlers.onStatus(payload.status);
  };

  const onTranscript = (e: MessageEvent): void => {
    if (!handlers.onTranscript) return;
    const payload = safeJson(String(e.data ?? ''));
    if (typeof payload.text === 'string') handlers.onTranscript(payload.text);
  };

  const onEvent = (e: MessageEvent): void => {
    if (!handlers.onEvent) return;
    const payload = safeJson(String(e.data ?? ''));
    handlers.onEvent({ type: e.type, data: payload });
  };

  source.addEventListener('status', onStatus as EventListener);
  source.addEventListener('transcript', onTranscript as EventListener);
  source.addEventListener('event', onEvent as EventListener);

  if (handlers.onError) {
    source.onerror = (): void => {
      handlers.onError?.(new Error('AIDX event stream errored'));
    };
  }

  return () => {
    source.removeEventListener('status', onStatus as EventListener);
    source.removeEventListener('transcript', onTranscript as EventListener);
    source.removeEventListener('event', onEvent as EventListener);
    source.close();
    handlers.onClose?.();
  };
}

// ---------------------------------------------------------------------------
// sendMorPhromConfirmInvite
// ---------------------------------------------------------------------------

export interface SendMorPhromConfirmInviteInput {
  cid: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string | null;
  clinicName: string | null;
  /** Deep-link the patient taps to launch the AI call inside MorPhrom. */
  joinUrl: string;
  /** Registered MOPH Promt service id. */
  serviceId: string;
}

/**
 * Send a "ยืนยันนัดผ่าตัด" Flex Message via หมอพร้อม. The patient sees a
 * card with the appointment details and a CTA button that opens the AIDX
 * conversation.
 */
export async function sendMorPhromConfirmInvite(
  input: SendMorPhromConfirmInviteInput,
): Promise<MophSendResult> {
  const subHeader = input.clinicName ?? 'นัดผ่าตัด';
  const timePart = input.appointmentTime ? ` เวลา ${input.appointmentTime.slice(0, 5)} น.` : '';

  const flex = buildMophFlexBubble({
    title: 'ยืนยันนัดผ่าตัด',
    subHeader,
    text:
      `เรียนคุณ${input.patientName}\n` +
      `คุณมีนัดวันที่ ${input.appointmentDate}${timePart}\n` +
      `กรุณากดปุ่มด้านล่างเพื่อยืนยันนัดกับผู้ช่วยพยาบาล AI`,
    confirmUrl: input.joinUrl,
    confirmLabel: 'เข้าคุยกับ AI',
    altText: 'ยืนยันนัดผ่าตัดผ่าน AI ผู้ช่วยพยาบาล',
  });

  return sendMophNotification({
    serviceId: input.serviceId,
    cid: input.cid,
    message: flex,
  });
}
