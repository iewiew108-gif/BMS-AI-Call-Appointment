// =============================================================================
// AppointmentDetailDrawer — right-side panel modelled after medai-screen:
// patient header → appointment → workflow → call timeline → events / transcript
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  X,
  Phone,
  Calendar,
  Stethoscope,
  ClipboardList,
  PlayCircle,
  AlertTriangle,
  MessageSquareText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { bestContactFor } from '@/services/operationAppointments';
import { formatDate } from '@/utils/dateUtils';
import type { EnrichedAppointment } from '@/hooks/useAppointments';
import type { CallStatus } from '@/types/appointment';

interface AppointmentDetailDrawerProps {
  appointment: EnrichedAppointment | null;
  onClose: () => void;
  onEnqueue: (row: EnrichedAppointment) => void;
  onEscalate: (row: EnrichedAppointment) => void;
  onMarkStatus: (row: EnrichedAppointment, status: CallStatus, reason?: string) => void;
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value || '—'}</p>
    </div>
  );
}

export function AppointmentDetailDrawer({
  appointment,
  onClose,
  onEnqueue,
  onEscalate,
  onMarkStatus,
}: AppointmentDetailDrawerProps) {
  const [reason, setReason] = useState<string>('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appointment) {
      setReason('');
      return;
    }
    setReason(appointment.callAttempt?.reason ?? '');

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [appointment, onClose]);

  if (!appointment) return null;

  const contact = bestContactFor(appointment);
  const hasMorPhromCid = appointment.cid && /^\d{13}$/.test(appointment.cid);
  const attempt = appointment.callAttempt;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-slate-900/30 backdrop-blur-sm"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs text-slate-500">OAPP #{appointment.oappId}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
              {appointment.patientName || 'ผู้ป่วย'}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="font-mono">HN {appointment.hn}</span>
              <span>•</span>
              <span>{appointment.cid ? `CID ${appointment.cid}` : 'ไม่มี CID'}</span>
              <AppointmentStatusBadge status={appointment.callStatus} className="ml-2" />
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Appointment section */}
          <Section title="รายละเอียดนัด" icon={Calendar}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="วันที่นัด" value={formatDate(appointment.nextDate)} />
              <Field
                label="เวลานัด"
                value={
                  appointment.nextTime
                    ? `${appointment.nextTime.slice(0, 5)}${
                        appointment.nextTimeEnd ? ` – ${appointment.nextTimeEnd.slice(0, 5)}` : ''
                      } น.`
                    : '—'
                }
              />
              <Field label="คลินิก" value={appointment.clinicName ?? appointment.clinic} />
              <Field label="แพทย์" value={appointment.doctorName ?? appointment.doctor} />
              <Field label="แผนก" value={appointment.depName} />
              <Field label="สถานะ HOSxP" value={`oapp_status = ${appointment.oappStatusId ?? '—'}`} />
            </div>
          </Section>

          {/* Operation section */}
          <Section title="ข้อมูลผ่าตัด" icon={Stethoscope}>
            <div className="space-y-2">
              <Field label="หัตถการ" value={appointment.operationNote ?? appointment.appCause} />
              <Field label="หมายเหตุ" value={appointment.note} />
            </div>
          </Section>

          {/* Contact section */}
          <Section title="ช่องทางติดต่อ" icon={Phone}>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="MorPhrom CID"
                value={
                  hasMorPhromCid ? appointment.cid : (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> ไม่มี — โทรเองไม่ได้
                    </span>
                  )
                }
              />
              <Field
                label={`เบอร์โทร (${contact.source === 'none' ? 'ไม่มี' : contact.source})`}
                value={contact.phone}
              />
              <Field label="เบอร์มือถือ" value={appointment.mobilePhone} />
              <Field label="เบอร์บ้าน" value={appointment.homePhone} />
              <Field label="ผู้แจ้ง" value={appointment.informPhone} />
            </div>
          </Section>

          {/* Call attempt section */}
          <Section title="ประวัติการโทร" icon={MessageSquareText}>
            {attempt ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <AppointmentStatusBadge status={attempt.status} />
                  <span className="text-xs text-slate-500">{attempt.attempts} ครั้ง</span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  อัปเดตล่าสุด {new Date(attempt.updatedAt).toLocaleString('th-TH')}
                </div>
                {attempt.caseId && (
                  <div className="mt-1 text-xs text-slate-500">
                    Case ID: <span className="font-mono">{attempt.caseId}</span>
                  </div>
                )}
                {attempt.reason && (
                  <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {attempt.reason}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">ยังไม่ได้โทรเคสนี้</p>
            )}
          </Section>

          {/* Manual override */}
          <Section title="แก้ไขสถานะด้วยตนเอง (พยาบาล)" icon={ClipboardList}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="หมายเหตุ / เหตุผล (ทำไมเปลี่ยนสถานะ)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              rows={3}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['confirmed', 'ยืนยัน'],
                ['rescheduled', 'เลื่อนนัด'],
                ['cancelled', 'ยกเลิก'],
                ['no_answer', 'ไม่รับสาย'],
              ] as Array<[CallStatus, string]>).map(([s, label]) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  onClick={() => onMarkStatus(appointment, s, reason || undefined)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onEscalate(appointment)}
            className="gap-1.5 text-rose-700 hover:bg-rose-50"
          >
            <AlertTriangle className="h-4 w-4" />
            Escalate ให้พยาบาล
          </Button>
          <Button
            onClick={() => onEnqueue(appointment)}
            disabled={!hasMorPhromCid || appointment.callStatus === 'already_visited'}
            className="gap-1.5"
          >
            <PlayCircle className="h-4 w-4" />
            ส่ง AI โทร (หมอพร้อม)
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}
