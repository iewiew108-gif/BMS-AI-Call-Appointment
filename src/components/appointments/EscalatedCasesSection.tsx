// =============================================================================
// EscalatedCasesSection — แสดงรายชื่อผู้ป่วยที่ AI โทรไม่สำเร็จ (escalated)
// ดึงข้อมูลจาก HOSxP (useAppointments) กรองเฉพาะ callStatus === 'escalated'
// =============================================================================

import { useMemo } from 'react';
import {
  AlertTriangle,
  Phone,
  Calendar,
  Clock,
  Stethoscope,
  BellRing,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppointments, type EnrichedAppointment } from '@/hooks/useAppointments';
import { formatDateISO } from '@/utils/dateUtils';
import type { UrgentCallbackPriority } from '@/types/urgentCallback';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalatedCallbackSeed {
  hn: string;
  patientName: string;
  phone: string;
  reason: string;
  ward: string;
  priority: UrgentCallbackPriority;
}

interface EscalatedCasesSectionProps {
  onCreateCallback: (seed: EscalatedCallbackSeed) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 14);
  const end = new Date(today);
  end.setDate(today.getDate() + 30);
  return { startDate: formatDateISO(start), endDate: formatDateISO(end) };
}

function getBestPhone(appt: EnrichedAppointment): string {
  return appt.mobilePhone ?? appt.homePhone ?? appt.informPhone ?? '';
}

function formatApptDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hr / 24);
  return `${days} วันที่แล้ว`;
}

// ---------------------------------------------------------------------------
// EscalatedCard
// ---------------------------------------------------------------------------

interface EscalatedCardProps {
  appt: EnrichedAppointment;
  onCreateCallback: (seed: EscalatedCallbackSeed) => void;
}

function EscalatedCard({ appt, onCreateCallback }: EscalatedCardProps) {
  const phone = getBestPhone(appt);
  const escalatedAt = appt.callAttempt?.updatedAt;
  const escalateReason = appt.callAttempt?.reason;

  const handleCreate = () => {
    onCreateCallback({
      hn: appt.hn,
      patientName: appt.patientName,
      phone,
      reason: escalateReason
        ? `[Escalated] ${escalateReason}`
        : `AI โทรยืนยันนัดไม่สำเร็จ — นัด ${formatApptDate(appt.nextDate)}${appt.clinicName ? ` คลินิก${appt.clinicName}` : ''}`,
      ward: appt.clinicName ?? appt.depName ?? '',
      priority: 'high',
    });
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />
            Escalated
          </Badge>
          {appt.callAttempt?.attempts && appt.callAttempt.attempts > 1 && (
            <span className="text-xs text-amber-700 font-medium">
              โทร {appt.callAttempt.attempts} ครั้ง
            </span>
          )}
        </div>
        {escalatedAt && (
          <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
            <Clock className="h-3 w-3" />
            {elapsedLabel(escalatedAt)}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div>
          <span className="text-xs text-slate-500">HN</span>
          <p className="font-medium font-mono">{appt.hn}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">ชื่อผู้ป่วย</span>
          <p className="font-medium">{appt.patientName}</p>
        </div>
        <div className="flex items-start gap-1">
          <div>
            <span className="text-xs text-slate-500">เบอร์โทร</span>
            <p className="font-medium font-mono flex items-center gap-1">
              <Phone className="h-3 w-3 text-slate-400" />
              {phone || <span className="text-slate-400">—</span>}
            </p>
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-500">วันนัด</span>
          <p className="font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3 text-slate-400" />
            {formatApptDate(appt.nextDate)}
            {appt.nextTime && (
              <span className="text-slate-500 text-xs">{appt.nextTime.slice(0, 5)} น.</span>
            )}
          </p>
        </div>
      </div>

      {(appt.clinicName || appt.doctorName) && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-600">
          <Stethoscope className="h-3 w-3 text-slate-400" />
          {appt.clinicName && <span>{appt.clinicName}</span>}
          {appt.clinicName && appt.doctorName && <span>•</span>}
          {appt.doctorName && <span>นพ./พญ. {appt.doctorName}</span>}
        </div>
      )}

      {escalateReason && (
        <div className="mt-2">
          <span className="text-xs text-slate-500">เหตุผล AI escalate</span>
          <p className="mt-0.5 text-xs text-amber-800 whitespace-pre-wrap">{escalateReason}</p>
        </div>
      )}

      <div className="mt-3">
        <Button
          size="sm"
          className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-xs"
          onClick={handleCreate}
        >
          <BellRing className="h-3.5 w-3.5" />
          สร้างรายการแจ้งพยาบาล
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EscalatedCasesSection
// ---------------------------------------------------------------------------

export function EscalatedCasesSection({ onCreateCallback }: EscalatedCasesSectionProps) {
  const dateRange = useMemo(() => buildDateRange(), []);

  const { rows, isLoading } = useAppointments({
    ...dateRange,
    callStatus: 'escalated',
    limit: 100,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        กำลังตรวจสอบเคสที่ AI โทรไม่สำเร็จ...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-3 flex items-center gap-2 text-sm text-amber-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        ไม่มีเคส AI escalate ในช่วง 14 วันที่ผ่านมา – 30 วันข้างหน้า
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        เคส AI โทรยืนยันนัดไม่สำเร็จ
        <span className="inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1.5">
          {rows.length}
        </span>
        <span className="text-xs font-normal text-slate-500">— รอพยาบาลติดตามโดยตรง</span>
      </h2>

      <div className="space-y-2">
        {rows.map((appt) => (
          <EscalatedCard
            key={appt.oappId}
            appt={appt}
            onCreateCallback={onCreateCallback}
          />
        ))}
      </div>
    </section>
  );
}
