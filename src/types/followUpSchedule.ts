export interface FollowUpTemplate {
  id: string;
  name: string;
  days: number[];   // days after opDate to follow up
}

export interface FollowUpSchedule {
  id: string;
  an: string;
  hn: string;
  dueDate: string;       // YYYY-MM-DD
  dayOffset: number;     // days after surgery
  label?: string;
  completedAt?: string;  // ISO datetime
  completedBy?: string;
  note?: string;
}
