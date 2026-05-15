// =============================================================================
// medai-screen (AIDX) integration
//
// Outbound integrations for the AI confirm-call workflow:
//   - enqueueConfirmCall        — POSTs a new case to the AI engine
//   - getCaseStatus             — GETs the current case status
//   - subscribeCaseEvents       — SSE stream of transcript / status events
//   - sendMorPhromConfirmInvite — wraps moph.ts to deliver the LINE Flex
//                                 invitation inside หมอพร้อม
//
// The AIDX API spec is still in flux, so the URL / auth are injectable via
// the `options` arg on every call. Default base URL is
// `medai-screen-api.bmscloud.in.th` per the visual reference at
// `medai-screen.bmscloud.in.th/aidx`.
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

/** Per-request timeout for enqueue / status fetches. */
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
  caseId: string;
  status: string;
  joinUrl?: string;
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
// enqueueConfirmCall
// ---------------------------------------------------------------------------

/**
 * Submit a new confirm-call case to the AIDX engine. The patient will then
 * receive a LINE Flex invitation via หมอพร้อม (separately via
 * {@link sendMorPhromConfirmInvite}) — opening it launches the AI call.
 *
 * @throws {Error} On CID validation failure, network error, or non-2xx
 *   response from the AIDX server.
 */
export async function enqueueConfirmCall(
  input: EnqueueConfirmCallInput,
  options?: AidxCallOptions,
): Promise<EnqueueConfirmCallResult> {
  validateMophCid(input.cid);

  const body = {
    oapp_id: input.oappId,
    cid: input.cid,
    hn: input.hn,
    patient_name: input.patientName,
    appointment_date: input.appointmentDate,
    appointment_time: input.appointmentTime,
    clinic_name: input.clinicName,
    doctor_name: input.doctorName,
    operation_note: input.operationNote,
    preparation_notes: input.preparationNotes,
    contact_phone: input.contactPhone,
    preferred_lang: input.preferredLang ?? 'th',
  };

  const response = await aidxFetch(
    '/api/cases',
    { method: 'POST', body: JSON.stringify(body) },
    options,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `AIDX enqueue failed (HTTP ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const parsed = (await response.json()) as {
    case_id?: string;
    status?: string;
    join_url?: string;
  };

  if (!parsed.case_id) {
    throw new Error('AIDX enqueue returned no case_id');
  }

  return {
    caseId: parsed.case_id,
    status: parsed.status ?? 'queued',
    joinUrl: parsed.join_url,
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// getCaseStatus
// ---------------------------------------------------------------------------

/** GET the current status of a case the engine is working on. */
export async function getCaseStatus(
  caseId: string,
  options?: AidxCallOptions,
): Promise<CaseStatusResult> {
  const response = await aidxFetch(
    `/api/cases/${encodeURIComponent(caseId)}`,
    { method: 'GET' },
    options,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `AIDX status failed (HTTP ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const parsed = (await response.json()) as {
    case_id?: string;
    status?: string;
    attempts?: number;
  };
  return {
    caseId: parsed.case_id ?? caseId,
    status: parsed.status ?? 'unknown',
    attempts: parsed.attempts,
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// subscribeCaseEvents — SSE
// ---------------------------------------------------------------------------

/**
 * Open an SSE stream to the case event feed. The default `EventSource`
 * constructor is used unless a test injects an alternative.
 *
 * Returns an unsubscribe function that closes the underlying stream.
 */
export function subscribeCaseEvents(
  caseId: string,
  handlers: CaseEventHandlers,
  options?: SubscribeCaseEventsOptions,
): () => void {
  const base = options?.baseUrl ?? AIDX_API_BASE;
  const url = `${base}/api/cases/${encodeURIComponent(caseId)}/events`;
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
