// =============================================================================
// Tests — src/services/operationAppointments.ts
//
// Covers the SQL shape, parameter binding, response parsing, and filter
// composition for the One Day Case appointment list query. Network is mocked
// at the global `fetch` level (same pattern as tests/unit/bmsSession.test.ts).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectionConfig, SqlApiResponse } from '@/types';
import type { AppointmentFilter, Appointment } from '@/types/appointment';
import {
  listOneDayCaseAppointments,
  bestContactFor,
  parseAppointmentRow,
  buildAppointmentSql,
  buildAppointmentParams,
} from '@/services/operationAppointments';
import { APP_IDENTIFIER } from '@/services/bmsSession';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): ConnectionConfig {
  return {
    apiUrl: 'https://bms.hospital.test',
    bearerToken: 'tok-xyz',
    databaseType: 'mysql',
    appIdentifier: APP_IDENTIFIER,
  };
}

function makeFilter(over?: Partial<AppointmentFilter>): AppointmentFilter {
  return {
    startDate: '2026-05-16',
    endDate: '2026-05-16',
    ...over,
  };
}

function makeSqlOk(rows: Record<string, unknown>[]): SqlApiResponse {
  return {
    result: {},
    MessageCode: 200,
    Message: 'OK',
    RequestTime: '2026-05-15T10:00:00Z',
    data: rows,
    field: [],
    field_name: [],
    record_count: rows.length,
  };
}

const SAMPLE_ROW = {
  oapp_id: 12345,
  hos_guid: '{ABC-123}',
  hn: '0000123',
  vn: '6705150001',
  vstdate: '2026-04-01',
  nextdate: '2026-05-16',
  nexttime: '09:00:00',
  nexttime_end: '09:30:00',
  clinic: '001',
  clinic_name: 'ศัลยกรรม-OPD',
  doctor: 'D01',
  doctor_name: 'นพ.สมชาย ใจดี',
  depcode: 'S01',
  dep_name: 'ศัลยกรรมทั่วไป',
  spclty: '01',
  patient_name: 'นายมานะ เก่งกาจ',
  cid: '1234567890123',
  sex: '1',
  birthday: '1960-04-12',
  mobile_phone_number: '0811234567',
  home_phone_number: '021234567',
  informtel: '0899876543',
  app_cause: 'ส่องกล้องลำไส้ใหญ่',
  note: 'งดน้ำงดอาหาร 6 ชม.',
  operation_note: 'Colonoscopy + Biopsy',
  app_user: 'nurse01',
  app_user_name: 'พยาบาลสมศรี',
  oapp_status_id: 1,
  oapp_status_name: 'รอยืนยัน',
  addr_name: '99 หมู่ 2 ถนนสุขุมวิท ต.บางจาก อ.พระโขนง จ.กรุงเทพ',
  queue_slot_number: 'A-12',
  referin_number: 'REF-001',
  lab_list_text: 'CBC, FBS, Creatinine',
  xray_list_text: 'CXR PA',
  mp_send_status: 'sent',
  mp_confirm_datetime: '2026-05-14 18:32:00',
  visit_status: 'ยังไม่ส่งตรวจ',
  visit_count: 0,
};

// ---------------------------------------------------------------------------
// Test setup
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

function mockSqlResponse(rows: Record<string, unknown>[]) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(makeSqlOk(rows)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ---------------------------------------------------------------------------
// buildAppointmentSql / buildAppointmentParams — pure unit tests
// ---------------------------------------------------------------------------

describe('buildAppointmentSql', () => {
  it('selects the oapp join with every HOSxPAppointmentListForm lookup table', () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).toMatch(/FROM\s+oapp\s+o/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+patient\s+p/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+clinic\s+c/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+thaiaddress\s+t/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+doctor\s+d/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+kskdepartment\s+k/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+oapp_status\s+o2/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+opduser\s+o3/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+opd_qs_slot\s+qs/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+referin\s+r1/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+oapp_message_send\s+om/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+ovst\s+ov/i);
  });

  it("does NOT filter by operation_appointment by default (matches native form)", () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).not.toMatch(/o\.operation_appointment\s*=\s*'Y'/);
  });

  it("adds operation_appointment='Y' only when onlyOneDayCase=true", () => {
    const sql = buildAppointmentSql(makeFilter({ onlyOneDayCase: true }));
    expect(sql).toMatch(/o\.operation_appointment\s*=\s*'Y'/);
  });

  it('keeps rows where oapp_status_id is NULL too', () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).toMatch(/o\.oapp_status_id\s*<\s*4\s*OR\s*o\.oapp_status_id\s+IS\s+NULL/i);
  });

  it('binds date range with :start_date / :end_date placeholders', () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).toContain(':start_date');
    expect(sql).toContain(':end_date');
  });

  it('orders by next date then time and applies a LIMIT', () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).toMatch(/ORDER\s+BY\s+o\.nextdate\s*,\s*o\.nexttime/i);
    expect(sql).toMatch(/LIMIT\s+200/i);
  });

  it('honours a custom limit when supplied', () => {
    const sql = buildAppointmentSql(makeFilter({ limit: 50 }));
    expect(sql).toMatch(/LIMIT\s+50/i);
  });

  it('caps the limit at 1000 to prevent runaway queries', () => {
    const sql = buildAppointmentSql(makeFilter({ limit: 999_999 }));
    expect(sql).toMatch(/LIMIT\s+1000/i);
  });

  it('adds a HN clause only when hn filter is non-empty', () => {
    expect(buildAppointmentSql(makeFilter({ hn: '0000123' }))).toContain(':hn');
    expect(buildAppointmentSql(makeFilter({ hn: null }))).not.toContain(':hn');
    expect(buildAppointmentSql(makeFilter())).not.toContain(':hn');
  });

  it('adds a clinic clause only when clinic filter is set', () => {
    expect(buildAppointmentSql(makeFilter({ clinic: '001' }))).toContain(':clinic');
    expect(buildAppointmentSql(makeFilter({ clinic: null }))).not.toContain(':clinic');
  });

  it('adds a doctor clause only when doctor filter is set', () => {
    expect(buildAppointmentSql(makeFilter({ doctor: 'D01' }))).toContain(':doctor');
    expect(buildAppointmentSql(makeFilter({ doctor: null }))).not.toContain(':doctor');
  });

  it('adds an app_user clause only when appUser filter is set', () => {
    expect(buildAppointmentSql(makeFilter({ appUser: 'nurse01' }))).toContain(':app_user');
    expect(buildAppointmentSql(makeFilter({ appUser: null }))).not.toContain(':app_user');
  });

  it('selects the HOSxPAppointmentListForm visible columns', () => {
    const sql = buildAppointmentSql(makeFilter());
    expect(sql).toContain('o.hos_guid');
    expect(sql).toContain('o.vstdate');
    expect(sql).toContain('o2.oapp_status_name');
    expect(sql).toContain('o3.name AS app_user_name');
    expect(sql).toContain('qs.queue_slot_number');
    expect(sql).toContain('r1.referin_number');
    expect(sql).toContain('lab_list_text');
    expect(sql).toContain('xray_list_text');
    expect(sql).toContain('om.rt_send_status AS mp_send_status');
    expect(sql).toContain('om.confirm_datetime AS mp_confirm_datetime');
    expect(sql).toContain("COALESCE(ov.vn, 'ยังไม่ส่งตรวจ') AS visit_status");
  });
});

describe('buildAppointmentParams', () => {
  it('emits date params for start and end with date value_type', () => {
    const params = buildAppointmentParams(makeFilter());
    expect(params.start_date).toEqual({ value: '2026-05-16', value_type: 'date' });
    expect(params.end_date).toEqual({ value: '2026-05-16', value_type: 'date' });
  });

  it('includes optional filters only when set', () => {
    const all = buildAppointmentParams(
      makeFilter({ clinic: '001', doctor: 'D01', appUser: 'nurse01', hn: '0000123' }),
    );
    expect(all.clinic).toEqual({ value: '001', value_type: 'string' });
    expect(all.doctor).toEqual({ value: 'D01', value_type: 'string' });
    expect(all.app_user).toEqual({ value: 'nurse01', value_type: 'string' });
    expect(all.hn).toEqual({ value: '0000123', value_type: 'string' });

    const minimal = buildAppointmentParams(makeFilter());
    expect(minimal.clinic).toBeUndefined();
    expect(minimal.doctor).toBeUndefined();
    expect(minimal.app_user).toBeUndefined();
    expect(minimal.hn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseAppointmentRow — row → domain object
// ---------------------------------------------------------------------------

describe('parseAppointmentRow', () => {
  it('maps all snake_case columns to camelCase domain fields', () => {
    const out = parseAppointmentRow(SAMPLE_ROW);
    expect(out.oappId).toBe(12345);
    expect(out.hn).toBe('0000123');
    expect(out.nextDate).toBe('2026-05-16');
    expect(out.nextTime).toBe('09:00:00');
    expect(out.clinic).toBe('001');
    expect(out.clinicName).toBe('ศัลยกรรม-OPD');
    expect(out.doctorName).toBe('นพ.สมชาย ใจดี');
    expect(out.depName).toBe('ศัลยกรรมทั่วไป');
    expect(out.patientName).toBe('นายมานะ เก่งกาจ');
    expect(out.cid).toBe('1234567890123');
    expect(out.mobilePhone).toBe('0811234567');
    expect(out.homePhone).toBe('021234567');
    expect(out.informPhone).toBe('0899876543');
    expect(out.appCause).toBe('ส่องกล้องลำไส้ใหญ่');
    expect(out.operationNote).toBe('Colonoscopy + Biopsy');
    expect(out.oappStatusId).toBe(1);
    expect(out.visitCount).toBe(0);
  });

  it('maps the HOSxPAppointmentListForm parity fields', () => {
    const out = parseAppointmentRow(SAMPLE_ROW);
    expect(out.hosGuid).toBe('{ABC-123}');
    expect(out.vstDate).toBe('2026-04-01');
    expect(out.spclty).toBe('01');
    expect(out.appUser).toBe('nurse01');
    expect(out.appUserName).toBe('พยาบาลสมศรี');
    expect(out.oappStatusName).toBe('รอยืนยัน');
    expect(out.addrName).toContain('99 หมู่ 2');
    expect(out.queueSlotNumber).toBe('A-12');
    expect(out.referinNumber).toBe('REF-001');
    expect(out.labListText).toBe('CBC, FBS, Creatinine');
    expect(out.xrayListText).toBe('CXR PA');
    expect(out.mpSendStatus).toBe('sent');
    expect(out.mpConfirmDatetime).toBe('2026-05-14 18:32:00');
    expect(out.visitStatus).toBe('ยังไม่ส่งตรวจ');
  });

  it('defaults visit_status to "ยังไม่ส่งตรวจ" when null', () => {
    const out = parseAppointmentRow({ ...SAMPLE_ROW, visit_status: null });
    expect(out.visitStatus).toBe('ยังไม่ส่งตรวจ');
  });

  it('keeps visit_status when the patient has been checked in', () => {
    const out = parseAppointmentRow({ ...SAMPLE_ROW, visit_status: '6705160001' });
    expect(out.visitStatus).toBe('6705160001');
  });

  it('treats empty strings, undefined, and explicit nulls as null', () => {
    const out = parseAppointmentRow({
      ...SAMPLE_ROW,
      vn: '',
      doctor: null,
      doctor_name: undefined,
      note: '   ',
    });
    expect(out.vn).toBeNull();
    expect(out.doctor).toBeNull();
    expect(out.doctorName).toBeNull();
    expect(out.note).toBeNull();
  });

  it('coerces numeric oapp_id / visit_count strings to numbers', () => {
    const out = parseAppointmentRow({
      ...SAMPLE_ROW,
      oapp_id: '999' as unknown as number,
      visit_count: '3' as unknown as number,
    });
    expect(out.oappId).toBe(999);
    expect(out.visitCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// bestContactFor — phone fallback chain
// ---------------------------------------------------------------------------

describe('bestContactFor', () => {
  function makeApt(over: Partial<Appointment>): Appointment {
    return parseAppointmentRow({
      ...SAMPLE_ROW,
      mobile_phone_number: null,
      home_phone_number: null,
      informtel: null,
      ...Object.fromEntries(
        Object.entries(over).map(([k, v]) => {
          const map: Record<string, string> = {
            mobilePhone: 'mobile_phone_number',
            homePhone: 'home_phone_number',
            informPhone: 'informtel',
          };
          return [map[k] ?? k, v];
        }),
      ),
    });
  }

  it('returns the mobile number when present', () => {
    const c = bestContactFor(makeApt({ mobilePhone: '0811111111' }));
    expect(c.phone).toBe('0811111111');
    expect(c.source).toBe('mobile');
  });

  it('falls back to home phone when mobile is null', () => {
    const c = bestContactFor(makeApt({ homePhone: '021234567' }));
    expect(c.phone).toBe('021234567');
    expect(c.source).toBe('home');
  });

  it('falls back to informant phone when both above are null', () => {
    const c = bestContactFor(makeApt({ informPhone: '0899876543' }));
    expect(c.phone).toBe('0899876543');
    expect(c.source).toBe('inform');
  });

  it('returns null with source "none" when every column is empty', () => {
    const c = bestContactFor(makeApt({}));
    expect(c.phone).toBeNull();
    expect(c.source).toBe('none');
  });

  it('ignores whitespace-only phone strings', () => {
    const c = bestContactFor(makeApt({ mobilePhone: '  ', homePhone: '021234567' }));
    expect(c.phone).toBe('021234567');
    expect(c.source).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// listOneDayCaseAppointments — end-to-end with fetch mocked
// ---------------------------------------------------------------------------

describe('listOneDayCaseAppointments', () => {
  it('POSTs to /api/sql with the bearer token and JSON body', async () => {
    mockSqlResponse([SAMPLE_ROW]);
    await listOneDayCaseAppointments(makeFilter(), makeConfig());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/sql');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-xyz');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('binds start_date / end_date params and includes app identifier', async () => {
    mockSqlResponse([SAMPLE_ROW]);
    await listOneDayCaseAppointments(makeFilter(), makeConfig());

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
      sql: string;
      app: string;
      params: Record<string, { value: string; value_type: string }>;
    };
    expect(body.app).toBe(APP_IDENTIFIER);
    expect(body.params.start_date).toEqual({ value: '2026-05-16', value_type: 'date' });
    expect(body.params.end_date).toEqual({ value: '2026-05-16', value_type: 'date' });
  });

  it('returns parsed Appointment objects', async () => {
    mockSqlResponse([SAMPLE_ROW]);
    const rows = await listOneDayCaseAppointments(makeFilter(), makeConfig());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.oappId).toBe(12345);
    expect(rows[0]!.patientName).toBe('นายมานะ เก่งกาจ');
  });

  it('returns an empty array when the API returns no rows', async () => {
    mockSqlResponse([]);
    const rows = await listOneDayCaseAppointments(makeFilter(), makeConfig());
    expect(rows).toEqual([]);
  });

  it('omits already-visited rows when excludeAlreadyVisited=true', async () => {
    mockSqlResponse([
      { ...SAMPLE_ROW, oapp_id: 1, visit_count: 0 },
      { ...SAMPLE_ROW, oapp_id: 2, visit_count: 1 },
    ]);
    const rows = await listOneDayCaseAppointments(
      makeFilter({ excludeAlreadyVisited: true }),
      makeConfig(),
    );
    expect(rows.map((r) => r.oappId)).toEqual([1]);
  });

  it('propagates session-unauthorized errors from executeSqlViaApi', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ MessageCode: 401, Message: 'Unauthorized' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      listOneDayCaseAppointments(makeFilter(), makeConfig()),
    ).rejects.toThrow(/Session unauthorized/);
  });
});
