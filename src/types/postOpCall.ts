// =============================================================================
// PostOpCall — ติดตามผู้ป่วยหลังผ่าตัด
// =============================================================================

export type PostOpCallResult =
  | 'answered'          // ติดต่อได้ / ตอบรับ
  | 'no_answer'         // ไม่รับสาย
  | 'refused'           // ปฏิเสธการติดตาม
  | 'appointment_made'; // นัดหมายแล้ว

export interface PostOpCallEntry {
  id: string;
  an: string;
  hn: string;
  callDate: string;       // ISO datetime
  callResult: PostOpCallResult;
  note: string;
  calledBy: string;
}

export interface PostOpPatientRow {
  hn: string;
  an: string;
  patientName: string;
  cid: string | null;
  homeTel: string | null;
  mobileTel: string | null;
  informTel: string | null;
  opDate: string;
  icd9Code: string;
  icd9Name: string | null;
  doctorName: string | null;
}
