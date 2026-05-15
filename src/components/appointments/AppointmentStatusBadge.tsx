// =============================================================================
// AppointmentStatusBadge — colour-coded pill for the call lifecycle state
// =============================================================================

import { cn } from '@/lib/utils';
import type { CallStatus } from '@/types/appointment';

interface StatusMeta {
  label: string;
  className: string;
  dot: string;
}

const STATUS_META: Record<CallStatus, StatusMeta> = {
  pending: {
    label: 'รอโทร',
    className: 'bg-amber-50 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
  },
  queued: {
    label: 'อยู่ในคิว',
    className: 'bg-sky-50 text-sky-800 border-sky-300',
    dot: 'bg-sky-500',
  },
  calling: {
    label: 'กำลังโทร',
    className: 'bg-blue-50 text-blue-800 border-blue-300 animate-pulse',
    dot: 'bg-blue-500',
  },
  confirmed: {
    label: 'ยืนยัน',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
  },
  rescheduled: {
    label: 'เลื่อนนัด',
    className: 'bg-orange-50 text-orange-800 border-orange-300',
    dot: 'bg-orange-500',
  },
  cancelled: {
    label: 'ยกเลิก',
    className: 'bg-red-50 text-red-800 border-red-300',
    dot: 'bg-red-500',
  },
  no_answer: {
    label: 'ไม่รับสาย',
    className: 'bg-slate-50 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
  },
  escalated: {
    label: 'Escalate',
    className: 'bg-rose-50 text-rose-800 border-rose-400',
    dot: 'bg-rose-600',
  },
  already_visited: {
    label: 'มาแล้ว',
    className: 'bg-teal-50 text-teal-800 border-teal-300',
    dot: 'bg-teal-600',
  },
};

interface AppointmentStatusBadgeProps {
  status: CallStatus;
  className?: string;
}

export function AppointmentStatusBadge({ status, className }: AppointmentStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
