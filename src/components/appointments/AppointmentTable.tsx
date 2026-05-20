// =============================================================================
// AppointmentTable — list of appointments mirroring HOSxPAppointmentListForm
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, ChevronRight, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
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

interface ContextMenu {
  x: number;
  y: number;
  row: EnrichedAppointment;
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

  // ---------------------------------------------------------------- context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ctxRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent, row: EnrichedAppointment) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, row });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* ---------------------------------------------------------------- table */}
      <div className="max-h-[72vh] overflow-y-auto">
        <table className="w-full table-fixed divide-y divide-slate-200 text-xs">
          {/*
            Percentages must account for 3 fixed w-8 (32 px each = 96 px) cols.
            On a ~1400 px table: fixed share ≈ 6.9 %, so % cols must sum ≤ ~93 %.
          */}
          <colgroup>
            <col className="w-8" />      {/* # */}
            <col className="w-8" />      {/* checkbox */}
            <col className="w-[8%]" />   {/* สถานะโทร */}
            <col className="w-[6%]" />   {/* วันนัด+เวลา */}
            <col className="w-[5%]" />   {/* HN */}
            <col className="w-[11%]" />  {/* ชื่อผู้ป่วย */}
            <col className="w-[5%]" />   {/* ชื่อเล่น */}
            <col className="w-[8%]" />   {/* เบอร์โทร */}
            <col className="w-[3.5%]" /> {/* QS */}
            <col className="w-[11%]" />  {/* คลินิก */}
            <col className="w-[10%]" />  {/* รายการผ่าตัด */}
            <col className="w-[9.5%]" /> {/* แพทย์ */}
            <col className="w-[6%]" />   {/* สถานะนัด */}
            <col className="w-[5.5%]" /> {/* มาแล้ว */}
            <col className="w-[7%]" />   {/* หมายเหตุ */}
            <col className="w-8" />      {/* detail */}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-1.5 py-2 text-center">#</th>
              <th className="px-1.5 py-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th className="px-1.5 py-2">สถานะโทร</th>
              <th className="px-1.5 py-2">วันนัด</th>
              <th className="px-1.5 py-2">HN</th>
              <th className="px-1.5 py-2">ชื่อผู้ป่วย</th>
              <th className="px-1.5 py-2">ชื่อเล่น</th>
              <th className="px-1.5 py-2">เบอร์โทร</th>
              <th className="px-1.5 py-2">QS</th>
              <th className="px-1.5 py-2">คลินิก / หัตถการ</th>
              <th className="px-1.5 py-2">รายการผ่าตัด</th>
              <th className="px-1.5 py-2">แพทย์</th>
              <th className="px-1.5 py-2">สถานะนัด</th>
              <th className="px-1.5 py-2">มาแล้ว</th>
              <th className="px-1.5 py-2">หมายเหตุ</th>
              <th className="px-1.5 py-2 text-right"><span className="sr-only">รายละเอียด</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={16} className="px-3 py-3">
                    <div className="h-7 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-6 py-16 text-center text-sm text-slate-500">
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
                const isEscalated = row.callStatus === 'escalated';
                return (
                  <tr
                    key={row.oappId}
                    onContextMenu={(e) => handleContextMenu(e, row)}
                    className={cn(
                      'transition hover:bg-slate-50',
                      !callable && 'bg-slate-50/60 text-slate-500',
                      isSelected && 'bg-blue-50/60',
                      isEscalated && 'bg-rose-50/40',
                    )}
                  >
                    {/* # */}
                    <td className="px-1.5 py-1.5 text-center text-[10px] text-slate-400">{index + 1}</td>

                    {/* checkbox */}
                    <td className="px-1.5 py-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        checked={isSelected}
                        disabled={!callable}
                        onChange={(e) => onToggleSelect(row.oappId, e.target.checked)}
                        aria-label={`เลือก oapp ${row.oappId}`}
                      />
                    </td>

                    {/* สถานะโทร */}
                    <td className="px-1.5 py-1.5">
                      <AppointmentStatusBadge status={row.callStatus} />
                    </td>

                    {/* วันนัด + เวลา */}
                    <td className="px-1.5 py-1.5 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{formatDateShort(row.nextDate)}</div>
                      <div className="font-mono text-[10px] text-slate-500">{formatTime(row.nextTime)}</div>
                    </td>

                    {/* HN */}
                    <td className="px-1.5 py-1.5 font-mono text-slate-700 truncate" title={row.hn}>
                      {row.hn}
                    </td>

                    {/* ชื่อผู้ป่วย */}
                    <td className="px-1.5 py-1.5">
                      <div
                        className={cn(
                          'truncate font-medium',
                          isEscalated ? 'text-rose-600' : 'text-slate-900',
                        )}
                        title={row.patientName}
                      >
                        {row.patientName || '—'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {age != null ? `${age} ปี` : ''}
                        {sexLabel(row.sex) !== '—' ? ` · ${sexLabel(row.sex)}` : ''}
                      </div>
                    </td>

                    {/* ชื่อเล่น */}
                    <td className="px-1.5 py-1.5">
                      <span
                        className="truncate block text-slate-600"
                        title={row.nickname ?? ''}
                      >
                        {row.nickname ? `"${row.nickname}"` : '—'}
                      </span>
                    </td>

                    {/* เบอร์โทร */}
                    <td className="px-1.5 py-1.5">
                      <div className="flex items-center gap-1 text-slate-700">
                        <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate" title={contact.phone ?? '—'}>{contact.phone ?? '—'}</span>
                      </div>
                      {!hasMorPhromCid && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> ไม่มี CID
                        </div>
                      )}
                    </td>

                    {/* QS Slot */}
                    <td className="px-1.5 py-1.5">
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-mono text-slate-700">
                        {row.queueSlotNumber ?? '—'}
                      </span>
                    </td>

                    {/* คลินิก / หัตถการ */}
                    <td className="px-1.5 py-1.5">
                      <div
                        className="truncate font-medium text-slate-800"
                        title={row.clinicName ?? row.clinic ?? '—'}
                      >
                        {row.clinicName ?? row.clinic ?? '—'}
                      </div>
                      <div
                        className="truncate text-[10px] text-slate-500"
                        title={row.operationNote ?? row.appCause ?? ''}
                      >
                        {row.operationNote ?? row.appCause ?? ''}
                      </div>
                    </td>

                    {/* รายการผ่าตัด */}
                    <td className="px-1.5 py-1.5">
                      {row.opSetNames ? (
                        <p className="truncate text-slate-800" title={row.opSetNames}>
                          {row.opSetNames.split('\n')[0]}
                        </p>
                      ) : row.operationNote ? (
                        <p className="truncate text-slate-500 italic" title={row.operationNote}>
                          {row.operationNote}
                        </p>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* แพทย์ */}
                    <td className="px-1.5 py-1.5">
                      <div
                        className="truncate text-slate-700"
                        title={row.doctorName ?? row.doctor ?? '—'}
                      >
                        {row.doctorName ?? row.doctor ?? '—'}
                      </div>
                      <div className="truncate text-[10px] text-slate-400" title={row.depName ?? ''}>
                        {row.depName ?? ''}
                      </div>
                    </td>

                    {/* สถานะนัด */}
                    <td className="px-1.5 py-1.5">
                      <span
                        className="truncate block text-[10px] text-slate-700"
                        title={row.oappStatusName ?? ''}
                      >
                        {row.oappStatusName ?? `#${row.oappStatusId ?? '—'}`}
                      </span>
                    </td>

                    {/* มาแล้ว */}
                    <td className="px-1.5 py-1.5">
                      {visited ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          มาแล้ว
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">ยังไม่มา</span>
                      )}
                    </td>

                    {/* หมายเหตุ */}
                    <td className="px-1.5 py-1.5">
                      <span
                        className="truncate block text-[10px] text-slate-600"
                        title={row.note ?? ''}
                      >
                        {row.note ?? '—'}
                      </span>
                    </td>

                    {/* detail */}
                    <td className="px-1.5 py-1.5 text-right">
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

      {/* ----------------------------------------------------------- footer */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span>รวม {rows.length} รายการ</span>
        <span>
          เลือกแล้ว <span className="font-semibold text-slate-900">{selectedIds.size}</span> รายการ
        </span>
      </div>

      {/* ----------------------------------------------------------- right-click context menu */}
      {ctxMenu && (
        <>
          <style>{`
            .appt-ctx-menu {
              position: fixed;
              top: var(--ctx-y);
              left: var(--ctx-x);
              z-index: 9999;
            }
          `}</style>
          <div
            ref={ctxRef}
            className="appt-ctx-menu min-w-[170px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            /* CSS custom props carry the dynamic coords; actual positioning is in the style block above */
            {...({ style: { '--ctx-x': `${ctxMenu.x}px`, '--ctx-y': `${ctxMenu.y}px` } } as React.HTMLAttributes<HTMLDivElement>)}
          >
            <div className="border-b border-slate-100 px-3 py-1.5">
              <p className="truncate text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                {ctxMenu.row.patientName || 'ผู้ป่วย'}
              </p>
              <p className="text-[10px] text-slate-400">{ctxMenu.row.hn}</p>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => { onOpenDetail(ctxMenu.row); setCtxMenu(null); }}
            >
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              ดูรายละเอียด
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onToggleSelect(ctxMenu.row.oappId, !selectedIds.has(ctxMenu.row.oappId));
                setCtxMenu(null);
              }}
            >
              {/* visual-only tick box — not a form element, avoids nested-interactive warning */}
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
                  selectedIds.has(ctxMenu.row.oappId)
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {selectedIds.has(ctxMenu.row.oappId) && (
                  <svg viewBox="0 0 8 8" className="h-2 w-2 fill-current">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                )}
              </span>
              {selectedIds.has(ctxMenu.row.oappId) ? 'ยกเลิกการเลือก' : 'เลือกรายการนี้'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
