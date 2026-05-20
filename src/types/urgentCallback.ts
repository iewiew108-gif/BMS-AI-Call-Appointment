// =============================================================================
// Urgent Callback — ส่งเรื่องเร่งด่วนให้พยาบาลติดต่อกลับ
// =============================================================================

export type UrgentCallbackStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type UrgentCallbackPriority = 'high' | 'critical';

export interface UrgentCallbackRequest {
  /** UUID — generated client-side. */
  id: string;
  /** HN ผู้ป่วย */
  hn: string;
  /** ชื่อ-นามสกุลผู้ป่วย */
  patientName: string;
  /** เบอร์โทรติดต่อ */
  phone: string;
  /** เหตุผล / อาการ */
  reason: string;
  /** ระดับความเร่งด่วน */
  priority: UrgentCallbackPriority;
  /** สถานะการติดต่อ */
  status: UrgentCallbackStatus;
  /** วอร์ด / แผนก ที่ส่งเรื่อง */
  ward: string;
  /** เวลาสร้างรายการ (ISO 8601) */
  createdAt: string;
  /** เวลาอัปเดตล่าสุด (ISO 8601) */
  updatedAt: string;
  /** พยาบาลที่ได้รับมอบหมาย (เลือกตอนสร้างเรื่อง) */
  assignedNurse?: string;
  /** หมายเหตุเพิ่มเติม (แยกจาก reason) */
  note?: string;
  /** ชื่อพยาบาลที่รับเรื่อง */
  resolvedBy?: string;
  /** หมายเหตุ / ผลการติดต่อ */
  resolvedNote?: string;
}
