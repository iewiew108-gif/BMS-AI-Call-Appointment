// =============================================================================
// AppointmentKpiCards — 4 stat tiles at the top of the page
// =============================================================================

import { CalendarClock, PhoneCall, ShieldCheck, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppointmentKpis } from '@/types/appointment';

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  tone: 'neutral' | 'positive' | 'caution' | 'alert';
}

const TONE_CLASSES: Record<KpiCardProps['tone'], string> = {
  neutral: 'border-slate-200 bg-white',
  positive: 'border-emerald-200 bg-emerald-50/40',
  caution: 'border-amber-200 bg-amber-50/40',
  alert: 'border-rose-200 bg-rose-50/40',
};

const ICON_CLASSES: Record<KpiCardProps['tone'], string> = {
  neutral: 'text-slate-500 bg-slate-100',
  positive: 'text-emerald-600 bg-emerald-100',
  caution: 'text-amber-600 bg-amber-100',
  alert: 'text-rose-600 bg-rose-100',
};

function KpiCard({ icon: Icon, label, value, hint, tone }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border p-4 sm:p-5', TONE_CLASSES[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600 sm:text-sm">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-slate-500 truncate">{hint}</p>
          ) : null}
        </div>
        <span className={cn('rounded-lg p-2', ICON_CLASSES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

interface AppointmentKpiCardsProps {
  kpis: AppointmentKpis;
}

export function AppointmentKpiCards({ kpis }: AppointmentKpiCardsProps) {
  const confirmPct = kpis.attempted > 0
    ? Math.round((kpis.confirmed / kpis.attempted) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={CalendarClock}
        tone="neutral"
        label="นัดทั้งหมด"
        value={kpis.total}
        hint="One Day Case ในช่วงที่เลือก"
      />
      <KpiCard
        icon={PhoneCall}
        tone="caution"
        label="โทรไปแล้ว"
        value={kpis.attempted}
        hint={kpis.total > 0 ? `${Math.round((kpis.attempted / kpis.total) * 100)}% ของทั้งหมด` : '—'}
      />
      <KpiCard
        icon={ShieldCheck}
        tone="positive"
        label="ยืนยันแล้ว"
        value={kpis.confirmed}
        hint={`${confirmPct}% ของที่โทร`}
      />
      <KpiCard
        icon={AlertOctagon}
        tone="alert"
        label="ต้อง Escalate"
        value={kpis.escalated}
        hint="ส่งต่อพยาบาลด่วน"
      />
    </div>
  );
}
