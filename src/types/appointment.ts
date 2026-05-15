// =============================================================================
// Appointment + AI confirm-call types
//
// Domain model for the "AI ผู้ช่วยพยาบาล" workflow: list One Day Case operation
// appointments from HOSxP `oapp`, enrich with patient contact info, and track
// the AI confirm-call lifecycle (queued → calling → confirmed / rescheduled
// / cancelled / no_answer / escalated). The call channel is MOPH MorPhrom
// (หมอพร้อม) — see services/moph.ts for the LINE-Flex delivery.
// =============================================================================

/** Patient sex code stored in `patient.sex` (1 = male, 2 = female). */
export type PatientSex = '1' | '2' | string;

/**
 * One row of the appointment list page — joins `oapp` with `patient`, `clinic`,
 * `doctor`, `kskdepartment`. Field names mirror the SQL aliases in
 * `listOneDayCaseAppointments` so the parser can drop straight into this shape.
 */
export interface Appointment {
  oappId: number;
  hn: string;
  vn: string | null;
  /** ISO date `YYYY-MM-DD` from `oapp.nextdate`. */
  nextDate: string;
  /** Time `HH:MM:SS` from `oapp.nexttime`. */
  nextTime: string | null;
  /** End time when the appointment is a slot window. */
  nextTimeEnd: string | null;

  /** Clinic code (`oapp.clinic`) + display name from `clinic.name`. */
  clinic: string | null;
  clinicName: string | null;

  /** Doctor code + display name. */
  doctor: string | null;
  doctorName: string | null;

  /** Department code + display name from `kskdepartment.department`. */
  depcode: string | null;
  depName: string | null;

  /** Display patient name (`pname` + `fname` + `lname`). */
  patientName: string;
  /** Thai 13-digit national ID — primary identifier for MorPhrom delivery. */
  cid: string | null;
  sex: PatientSex | null;
  /** Birthday `YYYY-MM-DD` from `patient.birthday`. */
  birthday: string | null;

  /** Phone fallback chain — mobile preferred, fall through to home / informant. */
  mobilePhone: string | null;
  homePhone: string | null;
  informPhone: string | null;

  /** Reason / note fields. */
  appCause: string | null;
  note: string | null;
  operationNote: string | null;

  /** Native `oapp.oapp_status_id` — only rows with status < 4 are listed. */
  oappStatusId: number | null;

  /**
   * 1 = patient already arrived (an `ovst` row exists for the appointment
   * date) — used to grey-out the row so the AI doesn't call someone who
   * already checked in.
   */
  visitCount: number;
}

/** Sentinel value the UI uses when a phone column needs explicit fallback chain. */
export interface BestContact {
  /** Preferred number after running the fallback chain. */
  phone: string | null;
  /** Which field the number was taken from, for the tooltip. */
  source: 'mobile' | 'home' | 'inform' | 'none';
}

/**
 * Status of an AI confirm-call attempt. Stored locally (not in HOSxP) keyed by
 * `oapp_id`. The taxonomy matches the badges in the dashboard wireframe.
 */
export type CallStatus =
  | 'pending'
  | 'queued'
  | 'calling'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'no_answer'
  | 'escalated'
  | 'already_visited';

/** One row of the call-attempts table. */
export interface CallAttempt {
  /** Local primary key — `oapp_id` of the linked appointment. */
  oappId: number;
  /** Latest status from the AI engine / nurse override. */
  status: CallStatus;
  /** When the attempt was last updated (ISO 8601). */
  updatedAt: string;
  /** How many times we have tried to reach the patient (≥ 0). */
  attempts: number;
  /** Optional opaque case id assigned by medai-screen. */
  caseId?: string;
  /** Free-text reason — escalate reason, rescheduled new date, etc. */
  reason?: string;
}

/** Filter state for the appointment list page. */
export interface AppointmentFilter {
  /** ISO `YYYY-MM-DD` lower bound on `oapp.nextdate` (inclusive). */
  startDate: string;
  /** ISO `YYYY-MM-DD` upper bound on `oapp.nextdate` (inclusive). */
  endDate: string;
  /** Filter to a single clinic code, or null for all. */
  clinic?: string | null;
  /** Filter to a single doctor code, or null for all. */
  doctor?: string | null;
  /** Substring search on HN (exact match in SQL). */
  hn?: string | null;
  /** Hide rows where the patient has already arrived. */
  excludeAlreadyVisited?: boolean;
  /** Limit the number of rows returned (defaults to 200). */
  limit?: number;
}

/** Display-only KPI tile values for the dashboard header. */
export interface AppointmentKpis {
  /** Total rows in the current filter. */
  total: number;
  /** Number of rows with a `confirmed` call attempt. */
  confirmed: number;
  /** Number of rows with any terminal call attempt (confirmed/rescheduled/cancelled/no_answer/escalated). */
  attempted: number;
  /** Number of rows with `escalated`. */
  escalated: number;
}
