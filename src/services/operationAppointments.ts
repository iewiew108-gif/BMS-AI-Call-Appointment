// =============================================================================
// One Day Case appointment service
//
// Lists outpatient operation appointments from HOSxP `oapp` joined with
// patient / clinic / doctor / department lookups. The result feeds the
// "AI ผู้ช่วยพยาบาล" confirm-call dashboard, so we surface CID (for
// MorPhrom delivery), the phone fallback chain (for manual escalation),
// and a `visit_count` flag that lets the UI hide patients who already
// arrived for their appointment.
//
// All filters bind via `:placeholders` so the server-side parser can keep
// validating SQL safely — no string interpolation of user input.
// =============================================================================

import type { ConnectionConfig, SqlParams } from '@/types';
import type {
  Appointment,
  AppointmentFilter,
  BestContact,
} from '@/types/appointment';
import { executeSqlViaApiQueued } from '@/services/bmsSession';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default page size — matches the wireframe pagination ("10–200 per page"). */
export const DEFAULT_APPOINTMENT_LIMIT = 200;

/** Hard cap so a misconfigured filter cannot pull half the database. */
export const MAX_APPOINTMENT_LIMIT = 1_000;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Convert empty / whitespace / null / undefined to `null`; trim otherwise. */
function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

/** Coerce `unknown` to a finite number; falls back to `0` for non-numeric input. */
function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Clamp the user-supplied limit into [1, MAX_APPOINTMENT_LIMIT]. */
function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_APPOINTMENT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_APPOINTMENT_LIMIT);
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

/**
 * Build the full SELECT for the appointment list — mirrors the column set
 * used by `HOSxPAppointmentListFormUnit`.
 *
 * Lists **all** appointment types (no operation-only filter): the AI
 * confirm-call workflow targets every patient on the schedule, not just
 * One Day Case operations.
 *
 * The clinic / doctor / appUser / hn filters are only appended when the
 * corresponding key on {@link AppointmentFilter} is non-empty so we never
 * emit unused placeholders.
 *
 * The `visit_count` subquery checks whether the patient already arrived
 * (`ovst.vstdate = oapp.nextdate`) so the UI can grey-out the row; the
 * `visit_status` column reflects the same idea via the explicit `visit_vn`
 * link (matches HOSxP's example query).
 */
export function buildAppointmentSql(filter: AppointmentFilter): string {
  const clauses: string[] = [
    'o.nextdate BETWEEN :start_date AND :end_date',
    '(o.oapp_status_id < 4 OR o.oapp_status_id IS NULL)',
  ];

  if (asNullableString(filter.clinic)) clauses.push('o.clinic = :clinic');
  if (asNullableString(filter.doctor)) clauses.push('o.doctor = :doctor');
  if (asNullableString(filter.appUser)) clauses.push('o.app_user = :app_user');
  if (asNullableString(filter.hn)) clauses.push('o.hn = :hn');

  const limit = clampLimit(filter.limit);

  return `
SELECT
  o.oapp_id, o.hos_guid, o.hn, o.vn,
  o.vstdate, o.nextdate, o.nexttime, o.nexttime_end,
  o.clinic, c.name AS clinic_name,
  o.doctor, d.name AS doctor_name,
  o.depcode, k.department AS dep_name, o.spclty,
  CONCAT(COALESCE(p.pname,''), COALESCE(p.fname,''), ' ', COALESCE(p.lname,'')) AS patient_name,
  p.cid, p.sex, p.birthday,
  p.mobile_phone_number, p.hometel, p.informtel,
  o.app_cause, o.note, o.operation_note,
  CAST(o.perform_text AS CHAR(500)) AS perform_text,
  o.app_user, o3.name AS app_user_name,
  o.oapp_status_id, o2.oapp_status_name,
  CAST(CONCAT(
    COALESCE(p.addrpart,''), ' หมู่ ', COALESCE(p.moopart,''),
    IF(LENGTH(p.road)>0, CONCAT(' ถนน', p.road), ''),
    ' ', COALESCE(t.full_name,'')
  ) AS CHAR(200)) AS addr_name,
  qs.queue_slot_number,
  r1.referin_number,
  CAST(o.lab_list_text  AS CHAR(1000)) AS lab_list_text,
  CAST(o.xray_list_text AS CHAR(1000)) AS xray_list_text,
  om.rt_send_status AS mp_send_status,
  om.confirm_datetime AS mp_confirm_datetime,
  COALESCE(ov.vn, 'ยังไม่ส่งตรวจ') AS visit_status,
  (SELECT COUNT(*) FROM ovst v WHERE v.hn = o.hn AND v.vstdate = o.nextdate) AS visit_count
FROM oapp o
LEFT JOIN patient            p  ON p.hn       = o.hn
LEFT JOIN clinic             c  ON c.clinic   = o.clinic
LEFT JOIN thaiaddress        t  ON t.chwpart  = p.chwpart
                               AND t.amppart  = p.amppart
                               AND t.tmbpart  = p.tmbpart
                               AND t.codetype = '3'
LEFT JOIN doctor             d  ON d.code     = o.doctor
LEFT JOIN kskdepartment      k  ON k.depcode  = o.depcode
LEFT JOIN oapp_status        o2 ON o2.oapp_status_id = o.oapp_status_id
LEFT JOIN opduser            o3 ON o3.loginname      = o.app_user
LEFT JOIN opd_qs_slot        qs ON qs.opd_qs_slot_id = o.opd_qs_slot_id
LEFT JOIN referin            r1 ON r1.vn       = o.referin_vn
LEFT JOIN oapp_message_send  om ON om.oapp_id  = o.oapp_id
LEFT JOIN ovst               ov ON ov.vn       = o.visit_vn
WHERE ${clauses.join('\n  AND ')}
ORDER BY o.nextdate, o.nexttime
LIMIT ${limit}
`.trim();
}

/**
 * Build the parameter map used by `/api/sql`. Only the date params are
 * always present — the optional ones are added only when the matching SQL
 * clause is included by {@link buildAppointmentSql}.
 */
export function buildAppointmentParams(filter: AppointmentFilter): SqlParams {
  const params: SqlParams = {
    start_date: { value: filter.startDate, value_type: 'date' },
    end_date: { value: filter.endDate, value_type: 'date' },
  };

  const clinic = asNullableString(filter.clinic);
  if (clinic) params.clinic = { value: clinic, value_type: 'string' };

  const doctor = asNullableString(filter.doctor);
  if (doctor) params.doctor = { value: doctor, value_type: 'string' };

  const appUser = asNullableString(filter.appUser);
  if (appUser) params.app_user = { value: appUser, value_type: 'string' };

  const hn = asNullableString(filter.hn);
  if (hn) params.hn = { value: hn, value_type: 'string' };

  return params;
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

/**
 * Convert one raw row from `/api/sql` into a typed {@link Appointment}.
 * Defensive against null / empty-string / undefined values that the BMS API
 * sometimes returns for missing fields.
 */
export function parseAppointmentRow(row: Record<string, unknown>): Appointment {
  return {
    oappId: asNumber(row.oapp_id),
    hn: asNullableString(row.hn) ?? '',
    vn: asNullableString(row.vn),
    nextDate: asNullableString(row.nextdate) ?? '',
    nextTime: asNullableString(row.nexttime),
    nextTimeEnd: asNullableString(row.nexttime_end),

    clinic: asNullableString(row.clinic),
    clinicName: asNullableString(row.clinic_name),

    doctor: asNullableString(row.doctor),
    doctorName: asNullableString(row.doctor_name),

    depcode: asNullableString(row.depcode),
    depName: asNullableString(row.dep_name),

    patientName: asNullableString(row.patient_name) ?? '',
    cid: asNullableString(row.cid),
    sex: asNullableString(row.sex),
    birthday: asNullableString(row.birthday),

    mobilePhone: asNullableString(row.mobile_phone_number),
    homePhone: asNullableString(row.hometel),
    informPhone: asNullableString(row.informtel),

    appCause: asNullableString(row.app_cause),
    note: asNullableString(row.note),
    operationNote: asNullableString(row.operation_note),
    performText: asNullableString(row.perform_text),

    oappStatusId: row.oapp_status_id == null ? null : asNumber(row.oapp_status_id),
    oappStatusName: asNullableString(row.oapp_status_name),
    visitCount: asNumber(row.visit_count),

    // HOSxPAppointmentListForm parity
    hosGuid: asNullableString(row.hos_guid),
    vstDate: asNullableString(row.vstdate),
    spclty: asNullableString(row.spclty),
    appUser: asNullableString(row.app_user),
    appUserName: asNullableString(row.app_user_name),
    addrName: asNullableString(row.addr_name),
    queueSlotNumber: asNullableString(row.queue_slot_number),
    referinNumber: asNullableString(row.referin_number),
    labListText: asNullableString(row.lab_list_text),
    xrayListText: asNullableString(row.xray_list_text),
    mpSendStatus: asNullableString(row.mp_send_status),
    mpConfirmDatetime: asNullableString(row.mp_confirm_datetime),
    visitStatus: asNullableString(row.visit_status) ?? 'ยังไม่ส่งตรวจ',
  };
}

// ---------------------------------------------------------------------------
// Contact fallback chain
// ---------------------------------------------------------------------------

/**
 * Pick the best phone number for manual escalation. Order: mobile → home →
 * informant. The chosen field is returned so the UI can show a "(จาก: มือถือ)"
 * tooltip.
 */
export function bestContactFor(appointment: Appointment): BestContact {
  const mobile = asNullableString(appointment.mobilePhone);
  if (mobile) return { phone: mobile, source: 'mobile' };

  const home = asNullableString(appointment.homePhone);
  if (home) return { phone: home, source: 'home' };

  const inform = asNullableString(appointment.informPhone);
  if (inform) return { phone: inform, source: 'inform' };

  return { phone: null, source: 'none' };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Query HOSxP for One Day Case appointments matching the supplied filter.
 *
 * @throws Re-throws any error from {@link executeSqlViaApiQueued} (network,
 *         timeout, session-unauthorized, SQL error, rate limit) — the caller
 *         (typically `useQuery`) is responsible for surfacing it to the user.
 */
export async function listOneDayCaseAppointments(
  filter: AppointmentFilter,
  config: ConnectionConfig,
  marketplaceToken?: string,
): Promise<Appointment[]> {
  const sql = buildAppointmentSql(filter);
  const params = buildAppointmentParams(filter);

  const response = await executeSqlViaApiQueued(sql, config, params, marketplaceToken);
  const rows = response.data ?? [];

  let parsed = rows.map(parseAppointmentRow);
  if (filter.excludeAlreadyVisited) {
    parsed = parsed.filter((r) => r.visitCount === 0);
  }
  return parsed;
}
