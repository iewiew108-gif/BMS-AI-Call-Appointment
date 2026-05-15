// =============================================================================
// Tests — src/services/aidx.ts
//
// Covers the three integrations the dashboard needs to talk to medai-screen
// (the external AI engine + telephony layer):
//   - enqueueConfirmCall  — POST a new case for the AI to call
//   - getCaseStatus       — GET the current case status
//   - subscribeCaseEvents — SSE wrapper for live transcript / status updates
//   - sendMorPhromConfirmInvite — sends a LINE Flex message via moph.ts so
//                                 the patient sees the call invitation inside
//                                 หมอพร้อม
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enqueueConfirmCall,
  getCaseStatus,
  subscribeCaseEvents,
  sendMorPhromConfirmInvite,
  AIDX_API_BASE,
} from '@/services/aidx';
import * as mophModule from '@/services/moph';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_INPUT = {
  oappId: 12345,
  cid: '1234567890123',
  hn: '0000123',
  patientName: 'นายมานะ เก่งกาจ',
  appointmentDate: '2026-05-16',
  appointmentTime: '09:00:00',
  clinicName: 'ศัลยกรรม-OPD',
  doctorName: 'นพ.สมชาย ใจดี',
  operationNote: 'Colonoscopy + Biopsy',
  preparationNotes: 'งดน้ำงดอาหาร 6 ชม.',
  contactPhone: '0811234567',
};

// ---------------------------------------------------------------------------
// Fetch + EventSource mock plumbing
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface MockEventSourceInstance {
  url: string;
  close: () => void;
  emit: (type: string, data: unknown) => void;
  emitError: () => void;
  listeners: Map<string, Array<(e: MessageEvent) => void>>;
  closed: boolean;
}

/** Minimal EventSource impl for tests — JSDOM doesn't ship one. */
function makeMockEventSourceCtor(): {
  ctor: typeof EventSource;
  last: () => MockEventSourceInstance | undefined;
} {
  const instances: MockEventSourceInstance[] = [];

  class MockEventSource {
    public url: string;
    public listeners = new Map<string, Array<(e: MessageEvent) => void>>();
    public closed = false;
    public onerror: ((e: unknown) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      instances.push(this as unknown as MockEventSourceInstance);
    }
    addEventListener(type: string, listener: (e: MessageEvent) => void): void {
      const arr = this.listeners.get(type) ?? [];
      arr.push(listener);
      this.listeners.set(type, arr);
    }
    removeEventListener(type: string, listener: (e: MessageEvent) => void): void {
      const arr = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        arr.filter((l) => l !== listener),
      );
    }
    close(): void {
      this.closed = true;
    }
    emit(type: string, data: unknown): void {
      const arr = this.listeners.get(type) ?? [];
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      for (const l of arr) l(event);
    }
    emitError(): void {
      if (this.onerror) this.onerror(new Event('error'));
    }
  }

  return {
    ctor: MockEventSource as unknown as typeof EventSource,
    last: () => instances[instances.length - 1],
  };
}

function mockJsonOk(body: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ---------------------------------------------------------------------------
// enqueueConfirmCall
// ---------------------------------------------------------------------------

describe('enqueueConfirmCall', () => {
  it('POSTs to the default AIDX base + /api/cases', async () => {
    mockJsonOk({ case_id: 'case-xyz', status: 'queued' });
    await enqueueConfirmCall(SAMPLE_INPUT);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${AIDX_API_BASE}/api/cases`);
    expect(init?.method).toBe('POST');
  });

  it('sends the bearer token when apiToken is supplied', async () => {
    mockJsonOk({ case_id: 'case-xyz', status: 'queued' });
    await enqueueConfirmCall(SAMPLE_INPUT, { apiToken: 'tok-abc' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-abc');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes all appointment fields in the JSON body', async () => {
    mockJsonOk({ case_id: 'case-xyz', status: 'queued' });
    await enqueueConfirmCall(SAMPLE_INPUT);

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
      oapp_id: number;
      cid: string;
      hn: string;
      patient_name: string;
      appointment_date: string;
      appointment_time: string | null;
      clinic_name: string | null;
      doctor_name: string | null;
      operation_note: string | null;
      preparation_notes: string | null;
      contact_phone: string | null;
      preferred_lang: string;
    };
    expect(body.oapp_id).toBe(12345);
    expect(body.cid).toBe('1234567890123');
    expect(body.patient_name).toBe('นายมานะ เก่งกาจ');
    expect(body.appointment_date).toBe('2026-05-16');
    expect(body.appointment_time).toBe('09:00:00');
    expect(body.operation_note).toBe('Colonoscopy + Biopsy');
    expect(body.preferred_lang).toBe('th');
  });

  it('respects an overridden baseUrl', async () => {
    mockJsonOk({ case_id: 'case-zzz', status: 'queued' });
    await enqueueConfirmCall(SAMPLE_INPUT, { baseUrl: 'https://custom.example' });

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe('https://custom.example/api/cases');
  });

  it('returns the normalized result with caseId and joinUrl', async () => {
    mockJsonOk({
      case_id: 'case-xyz',
      status: 'queued',
      join_url: 'https://medai-screen.bmscloud.in.th/aidx/case/case-xyz',
    });
    const result = await enqueueConfirmCall(SAMPLE_INPUT);
    expect(result.caseId).toBe('case-xyz');
    expect(result.status).toBe('queued');
    expect(result.joinUrl).toBe(
      'https://medai-screen.bmscloud.in.th/aidx/case/case-xyz',
    );
  });

  it('throws a descriptive error when the server returns non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
    await expect(enqueueConfirmCall(SAMPLE_INPUT)).rejects.toThrow(
      /AIDX enqueue failed/i,
    );
  });

  it('throws when CID is malformed (non-13-digit)', async () => {
    await expect(
      enqueueConfirmCall({ ...SAMPLE_INPUT, cid: '12345' }),
    ).rejects.toThrow(/CID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCaseStatus
// ---------------------------------------------------------------------------

describe('getCaseStatus', () => {
  it('GETs /api/cases/:id and returns the JSON body', async () => {
    mockJsonOk({ case_id: 'case-abc', status: 'calling', attempts: 2 });
    const r = await getCaseStatus('case-abc');
    expect(r.caseId).toBe('case-abc');
    expect(r.status).toBe('calling');
    expect(r.attempts).toBe(2);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${AIDX_API_BASE}/api/cases/case-abc`);
    expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
  });
});

// ---------------------------------------------------------------------------
// subscribeCaseEvents
// ---------------------------------------------------------------------------

describe('subscribeCaseEvents', () => {
  it('opens an EventSource against the case stream URL', () => {
    const { ctor, last } = makeMockEventSourceCtor();
    const stop = subscribeCaseEvents('case-1', {}, { EventSourceCtor: ctor });
    expect(last()?.url).toBe(`${AIDX_API_BASE}/api/cases/case-1/events`);
    stop();
  });

  it('forwards status messages to onStatus', () => {
    const { ctor, last } = makeMockEventSourceCtor();
    const onStatus = vi.fn();
    const stop = subscribeCaseEvents('c2', { onStatus }, { EventSourceCtor: ctor });
    last()?.emit('status', { status: 'calling' });
    expect(onStatus).toHaveBeenCalledWith('calling');
    stop();
  });

  it('forwards transcript chunks to onTranscript', () => {
    const { ctor, last } = makeMockEventSourceCtor();
    const onTranscript = vi.fn();
    const stop = subscribeCaseEvents('c3', { onTranscript }, { EventSourceCtor: ctor });
    last()?.emit('transcript', { text: 'สวัสดีค่ะ ' });
    last()?.emit('transcript', { text: 'คุณมีนัดพรุ่งนี้' });
    expect(onTranscript).toHaveBeenNthCalledWith(1, 'สวัสดีค่ะ ');
    expect(onTranscript).toHaveBeenNthCalledWith(2, 'คุณมีนัดพรุ่งนี้');
    stop();
  });

  it('forwards generic events to onEvent', () => {
    const { ctor, last } = makeMockEventSourceCtor();
    const onEvent = vi.fn();
    const stop = subscribeCaseEvents('c4', { onEvent }, { EventSourceCtor: ctor });
    last()?.emit('event', { type: 'rx', payload: 'NPO confirmed' });
    expect(onEvent).toHaveBeenCalledTimes(1);
    stop();
  });

  it('returns an unsubscribe function that closes the stream', () => {
    const { ctor, last } = makeMockEventSourceCtor();
    const stop = subscribeCaseEvents('c5', {}, { EventSourceCtor: ctor });
    expect(last()?.closed).toBe(false);
    stop();
    expect(last()?.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendMorPhromConfirmInvite
// ---------------------------------------------------------------------------

describe('sendMorPhromConfirmInvite', () => {
  it('builds a LINE Flex bubble and delegates to sendMophNotification', async () => {
    const sendSpy = vi
      .spyOn(mophModule, 'sendMophNotification')
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        body: 'success',
      });

    const result = await sendMorPhromConfirmInvite({
      cid: '1234567890123',
      patientName: 'นายมานะ เก่งกาจ',
      appointmentDate: '2026-05-16',
      appointmentTime: '09:00:00',
      clinicName: 'ศัลยกรรม-OPD',
      joinUrl: 'https://medai-screen.bmscloud.in.th/aidx/case/case-1',
      serviceId: 'srv-aidx',
    });

    expect(result.success).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const args = sendSpy.mock.calls[0]![0];
    expect(args.cid).toBe('1234567890123');
    expect(args.serviceId).toBe('srv-aidx');
    expect(args.message.type).toBe('flex');
    expect(args.message.altText).toContain('ยืนยันนัด');
  });
});
