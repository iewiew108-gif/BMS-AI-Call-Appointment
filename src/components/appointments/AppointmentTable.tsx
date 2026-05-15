// =============================================================================
// AppointmentTable — sortable list of One Day Case appointments
// =============================================================================

import { useMemo } from 'react';
import { Phone, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { bestContactFor } from '@/services/operationAppointments';
import type { EnrichedAppointment } from '@/hooks/useAppointments';

interface AppointmentTableProps {
  rows: EnrichedAppointment[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number, selected: boolean) => void;
  onToggleSelectAll: (selected: boolean) => void;
  onOpenDetail: (row: EnrichedAppointment) => void;
  isLoading: boolean;
}

function formatTime(time: string | null): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function calcAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const bd = new Date(birthday);
  if (Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

function sexLabel(sex: string | null): string {
  if (sex === '1') return 'ชาย';
  if (sex === '2') return 'หญิง';
  return '—';
}

export function AppointmentTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetail,
  isLoading,
}: AppointmentTableProps) {
  const callableRows = useMemo(
    () => rows.filter((r) => r.callStatus !== 'already_visited'),
    [rows],
  );
  const allSelected =
    callableRows.length > 0 &&
    callableRows.every((r) => selectedIds.has(r.oappId));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[60vh] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th className="px-3 py-3">นัด</th>
              <th className="px-3 py-3">HN</th>
              <th className="px-3 py-3">ผู้ป่วย</th>
              <th className="px-3 py-3">คลินิก / หัตถการ</th>
              <th className="px-3 py-3">แพทย์</th>
              <th className="px-3 py-3">CID / เบอร์</th>
              <th className="px-3 py-3">สถานะ</th>
              <th className="w-10 px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={9} className="px-3 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-sm text-slate-500">
                  <p className="font-medium text-slate-700">ไม่มีรายการนัดในช่วงที่เลือก</p>
                  <p className="mt-1">ลองปรับช่วงวันที่ หรือเอาเงื่อนไขออกบางอัน</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selectedIds.has(row.oappId);
                const callable = row.callStatus !== 'already_visited';
                const age = calcAge(row.birthday);
                const contact = bestContactFor(row);
                const hasMorPhromCid = row.cid && /^\d{13}$/.test(row.cid);
                return (
                  <tr
                    key={row.oappId}
                    className={cn(
                      'transition',
                      !callable && 'bg-slate-50/60 text-slate-500',
                      isSelected && 'bg-blue-50/60',
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={isSelected}
                        disabled={!callable}
                        onChange={(e) => onToggleSelect(row.oappId, e.target.checked)}
                        aria-label={`เลือก oapp ${row.oappId}`}
                      />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{formatDateShort(row.nextDate)}</div>
                      <div className="text-xs text-slate-500">{formatTime(row.nextTime)} น.</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{row.hn}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.patientName || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {age != null ? `${age} ปี` : '—'} {sexLabel(row.sex) !== '—' ? `• ${sexLabel(row.sex)}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800">{row.clinicName ?? row.clinic ?? '—'}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[16rem]">
                        {row.operationNote ?? row.appCause ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="text-sm">{row.doctorName ?? row.doctor ?? '—'}</div>
                      <div className="text-xs text-slate-500">{row.depName ?? '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs text-slate-700">
                        {hasMorPhromCid ? row.cid : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> ไม่มี CID
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="h-3 w-3" />
                        {contact.phone ?? 'ไม่มี'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <AppointmentStatusBadge status={row.callStatus} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(row)}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        aria-label="ดูรายละเอียด"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span>รวม {rows.length} รายการ</span>
        <span>
          เลือกแล้ว <span className="font-semibold text-slate-900">{selectedIds.size}</span> รายการ
        </span>
      </div>
    </div>
  );
}
