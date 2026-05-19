// =============================================================================
// AppointmentTable — list of appointments mirroring HOSxPAppointmentListForm
// =============================================================================

import { useMemo } from 'react';
import { Phone, ChevronRight, AlertTriangle, FlaskConical, Scan, CheckCircle2 } from 'lucide-react';
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

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

function formatDateTimeShort(iso: string | null): string {
  if (!iso) return '—';
  // Accepts "2026-05-14 18:32:00" or ISO
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (match) return `${match[3]}/${match[2]} ${match[4]}:${match[5]}`;
  return iso;
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
      <div className="max-h-[65vh] overflow-auto">
        <table className="min-w-[1500px] divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-2 py-2 text-center">#</th>
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th className="px-2 py-2">วันนัด</th>
              <th className="px-2 py-2">เวลา</th>
              <th className="px-2 py-2">HN</th>
              <th className="min-w-[11rem] px-2 py-2">ชื่อผู้ป่วย</th>
              <th className="px-2 py-2">เบอร์โทร</th>
              <th className="px-2 py-2">QS Slot</th>
              <th className="min-w-[16rem] px-2 py-2">คลินิก / หัตถการ</th>
              <th className="min-w-[14rem] px-2 py-2">ชื่อรายการผ่าตัด</th>
              <th className="min-w-[9rem] px-2 py-2">วัน/เวลาผ่าตัด</th>
              <th className="min-w-[10rem] px-2 py-2">แพทย์</th>
              <th className="px-2 py-2">สถานะนัด</th>
              <th className="px-2 py-2">สถานะโทร</th>
              <th className="px-2 py-2">มาตรวจ</th>
              <th className="px-2 py-2">หมอพร้อม</th>
              <th className="px-2 py-2">Lab / X-Ray</th>
              <th className="px-2 py-2">ผู้นัด</th>
              <th className="px-2 py-2">หมายเหตุ</th>
              <th className="w-10 px-2 py-2 text-right" aria-label="รายละเอียด" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={20} className="px-3 py-3">
                    <div className="h-8 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={20} className="px-6 py-16 text-center text-sm text-slate-500">
                  <p className="font-medium text-slate-700">ไม่มีรายการนัดในช่วงที่เลือก</p>
                  <p className="mt-1">ลองปรับช่วงวันที่ หรือเอาเงื่อนไขออกบางอัน</p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const isSelected = selectedIds.has(row.oappId);
                const callable = row.callStatus !== 'already_visited';
                const age = calcAge(row.birthday);
                const contact = bestContactFor(row);
                const hasMorPhromCid = row.cid && /^\d{13}$/.test(row.cid);
                const visited = row.visitStatus !== 'ยังไม่ส่งตรวจ';
                return (
                  <tr
                    key={row.oappId}
                    className={cn(
                      'transition hover:bg-slate-50',
                      !callable && 'bg-slate-50/60 text-slate-500',
                      isSelected && 'bg-blue-50/60',
                    )}
                  >
                    <td className="px-2 py-2 text-center text-xs text-slate-500">{index + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={isSelected}
                        disabled={!callable}
                        onChange={(e) => onToggleSelect(row.oappId, e.target.checked)}
                        aria-label={`เลือก oapp ${row.oappId}`}
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{formatDateShort(row.nextDate)}</div>
                      {row.vstDate && (
                        <div className="text-[10px] text-slate-400">จาก {formatDateShort(row.vstDate)}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-700">
                      <div className="font-mono text-xs">{formatTime(row.nextTime)}</div>
                      {row.nextTimeEnd && (
                        <div className="font-mono text-[10px] text-slate-400">
                          – {formatTime(row.nextTimeEnd)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-700">{row.hn}</td>
                    <td className="min-w-[11rem] px-2 py-2">
                      <div className="font-medium text-slate-900">{row.patientName || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {age != null ? `${age} ปี` : '—'} {sexLabel(row.sex) !== '—' ? `• ${sexLabel(row.sex)}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 text-xs text-slate-700">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {contact.phone ?? '—'}
                      </div>
                      {!hasMorPhromCid && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> ไม่มี CID
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                        {row.queueSlotNumber ?? '—'}
                      </span>
                    </td>
                    <td className="min-w-[16rem] px-2 py-2">
                      <div className="font-medium text-slate-800">{row.clinicName ?? row.clinic ?? '—'}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[20rem]">
                        {row.operationNote ?? row.appCause ?? '—'}
                      </div>
                    </td>
                    {/* ชื่อรายการผ่าตัด */}
                    <td className="min-w-[14rem] px-2 py-2">
                      {row.performText ? (
                        <p className="whitespace-pre-line text-xs text-slate-800 leading-relaxed line-clamp-3" title={row.performText}>
                          {row.performText}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    {/* วัน/เวลาผ่าตัด */}
                    <td className="min-w-[9rem] px-2 py-2 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{formatDateShort(row.nextDate)}</div>
                      {row.nextTime && (
                        <div className="font-mono text-xs text-slate-600">
                          {formatTime(row.nextTime)}
                          {row.nextTimeEnd ? ` – ${formatTime(row.nextTimeEnd)}` : ''} น.
                        </div>
                      )}
                    </td>
                    <td className="min-w-[10rem] px-2 py-2 text-slate-700">
                      <div className="text-sm">{row.doctorName ?? row.doctor ?? '—'}</div>
                      <div className="text-[10px] text-slate-400">{row.depName ?? '—'}</div>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-[11px] text-slate-700">
                        {row.oappStatusName ?? `#${row.oappStatusId ?? '—'}`}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <AppointmentStatusBadge status={row.callStatus} />
                    </td>
                    <td className="px-2 py-2">
                      {visited ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {row.visitStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">ยังไม่มา</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {row.mpConfirmDatetime ? (
                        <div className="text-emerald-700">
                          ✓ {formatDateTimeShort(row.mpConfirmDatetime)}
                        </div>
                      ) : row.mpSendStatus ? (
                        <div className="text-slate-600">📤 {row.mpSendStatus}</div>
                      ) : (
                        <div className="text-slate-400">—</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-0.5 text-[10px]">
                        {row.labListText && (
                          <span className="inline-flex items-center gap-1 text-blue-700">
                            <FlaskConical className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[10rem]" title={row.labListText}>
                              {row.labListText}
                            </span>
                          </span>
                        )}
                        {row.xrayListText && (
                          <span className="inline-flex items-center gap-1 text-violet-700">
                            <Scan className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[10rem]" title={row.xrayListText}>
                              {row.xrayListText}
                            </span>
                          </span>
                        )}
                        {!row.labListText && !row.xrayListText && (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {row.appUserName ?? row.appUser ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600 truncate max-w-[12rem]">
                      {row.note ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
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
