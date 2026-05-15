// =============================================================================
// AppointmentList — page composing filter bar, KPI cards, table, drawer,
// and bulk dialog for the AI confirm-call workflow.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { PhoneCall, ListChecks, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppointmentKpiCards } from '@/components/appointments/AppointmentKpiCards';
import { AppointmentFilterBar } from '@/components/appointments/AppointmentFilterBar';
import { AppointmentTable } from '@/components/appointments/AppointmentTable';
import { AppointmentDetailDrawer } from '@/components/appointments/AppointmentDetailDrawer';
import { BulkCallQueueDialog } from '@/components/appointments/BulkCallQueueDialog';
import { useAppointments, type EnrichedAppointment } from '@/hooks/useAppointments';
import { upsertCallAttempt } from '@/services/callAttempts';
import { enqueueConfirmCall, sendMorPhromConfirmInvite } from '@/services/aidx';
import { notifyError, notifySuccess, notifyWarning } from '@/services/notify';
import type { CallStatus } from '@/types/appointment';

/**
 * MOPH Promt service id for the AI confirm-call channel. This is a placeholder
 * — replace with the registered service id when the customer onboards their
 * MorPhrom integration.
 */
const MORPHROM_SERVICE_ID = 'bms-aidx-confirm';

export default function AppointmentList() {
  const {
    filter,
    setFilter,
    resetFilter,
    rows,
    kpis,
    isLoading,
    isError,
    error,
    executionTimeMs,
    refetch,
  } = useAppointments();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerRow, setDrawerRow] = useState<EnrichedAppointment | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // ------------------------------------------------------------------ select
  const toggleSelect = useCallback((id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (selected: boolean) => {
      setSelectedIds(() => {
        if (!selected) return new Set();
        return new Set(rows.filter((r) => r.callStatus !== 'already_visited').map((r) => r.oappId));
      });
    },
    [rows],
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.oappId)),
    [rows, selectedIds],
  );

  // ------------------------------------------------------------------ actions

  const sendOne = useCallback(async (row: EnrichedAppointment): Promise<boolean> => {
    if (!row.cid || !/^\d{13}$/.test(row.cid)) {
      notifyWarning(`ข้าม ${row.patientName} — ไม่มี CID ครบ 13 หลัก`);
      return false;
    }

    try {
      upsertCallAttempt({ oappId: row.oappId, status: 'queued', reason: 'ส่งเข้าคิว AI' });

      const enqueued = await enqueueConfirmCall({
        oappId: row.oappId,
        cid: row.cid,
        hn: row.hn,
        patientName: row.patientName,
        appointmentDate: row.nextDate,
        appointmentTime: row.nextTime,
        clinicName: row.clinicName,
        doctorName: row.doctorName,
        operationNote: row.operationNote,
        preparationNotes: row.note,
        contactPhone: row.mobilePhone ?? row.homePhone ?? null,
      });

      const joinUrl =
        enqueued.joinUrl ?? `https://medai-screen.bmscloud.in.th/aidx/case/${enqueued.caseId}`;

      const sendResult = await sendMorPhromConfirmInvite({
        cid: row.cid,
        patientName: row.patientName,
        appointmentDate: row.nextDate,
        appointmentTime: row.nextTime,
        clinicName: row.clinicName,
        joinUrl,
        serviceId: MORPHROM_SERVICE_ID,
      });

      upsertCallAttempt({
        oappId: row.oappId,
        status: sendResult.success ? 'calling' : 'queued',
        caseId: enqueued.caseId,
        reason: sendResult.success
          ? 'ส่ง LINE Flex ผ่านหมอพร้อมแล้ว'
          : `ส่งหมอพร้อมล้มเหลว: ${sendResult.body.slice(0, 100)}`,
      });

      return sendResult.success;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      upsertCallAttempt({
        oappId: row.oappId,
        status: 'escalated',
        reason: `ระบบขัดข้อง: ${msg}`,
      });
      return false;
    }
  }, []);

  const handleEnqueueOne = useCallback(
    async (row: EnrichedAppointment) => {
      const ok = await sendOne(row);
      if (ok) notifySuccess(`ส่ง ${row.patientName} เข้าคิว AI แล้ว`);
      else notifyError(`ไม่สามารถส่ง ${row.patientName} เข้าคิวได้ — ตรวจสอบที่ Detail`);
      setDrawerRow(null);
    },
    [sendOne],
  );

  const handleConfirmBulk = useCallback(async () => {
    setIsSending(true);
    let ok = 0;
    let fail = 0;
    for (const r of selectedRows) {
      const success = await sendOne(r);
      if (success) ok += 1;
      else fail += 1;
    }
    setIsSending(false);
    setBulkOpen(false);
    setSelectedIds(new Set());

    if (ok > 0) notifySuccess(`ส่งเข้าคิว AI สำเร็จ ${ok} รายการ`);
    if (fail > 0) notifyWarning(`มี ${fail} รายการที่ส่งไม่สำเร็จ`);
  }, [selectedRows, sendOne]);

  const handleEscalate = useCallback((row: EnrichedAppointment) => {
    upsertCallAttempt({
      oappId: row.oappId,
      status: 'escalated',
      reason: 'พยาบาลกดส่งต่อด้วยตนเอง',
    });
    notifyWarning(`ส่งต่อ ${row.patientName} ให้พยาบาลแล้ว`);
    setDrawerRow(null);
  }, []);

  const handleMarkStatus = useCallback(
    (row: EnrichedAppointment, status: CallStatus, reason?: string) => {
      upsertCallAttempt({ oappId: row.oappId, status, reason });
      notifySuccess(`อัปเดตสถานะ ${row.patientName} → ${status}`);
    },
    [],
  );

  // ------------------------------------------------------------------ render
  const lastUpdate = executionTimeMs != null
    ? `อัปเดตเมื่อ ${new Date().toLocaleTimeString('th-TH')} (${executionTimeMs} ms)`
    : 'รอข้อมูล...';

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-2 pb-12 sm:px-4">
      {/* Hero */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <Sparkles className="h-3 w-3" />
              AI ผู้ช่วยพยาบาล • หมอพร้อม
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              ทะเบียนนัดผ่าตัด One Day Case — โทรยืนยัน
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              ดึงรายการจาก HOSxP <span className="font-mono">oapp</span> ที่ <code>operation_appointment = &apos;Y&apos;</code> และส่งคิวให้ AI โทรผ่านหมอพร้อม
            </p>
          </div>
          <div className="text-xs text-slate-500">{lastUpdate}</div>
        </div>
      </header>

      {/* KPI */}
      <AppointmentKpiCards kpis={kpis} />

      {/* Filter */}
      <AppointmentFilterBar
        filter={filter}
        setFilter={setFilter}
        resetFilter={resetFilter}
        onRefresh={() => void refetch()}
        isLoading={isLoading}
      />

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <ListChecks className="h-4 w-4 text-slate-500" />
          เลือก {selectedIds.size} รายการ
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={() => setSelectedIds(new Set())}
          >
            ล้างการเลือก
          </Button>
          <Button
            size="sm"
            onClick={() => setBulkOpen(true)}
            disabled={selectedIds.size === 0}
            className="gap-1.5"
          >
            <PhoneCall className="h-4 w-4" />
            ส่งเข้าคิว AI ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-medium">โหลดข้อมูลไม่สำเร็จ</p>
          <p className="mt-1 text-xs">{error?.message ?? 'ไม่ทราบสาเหตุ'}</p>
        </div>
      )}

      {/* Table */}
      <AppointmentTable
        rows={rows}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpenDetail={setDrawerRow}
        isLoading={isLoading}
      />

      {/* Drawer */}
      <AppointmentDetailDrawer
        appointment={drawerRow}
        onClose={() => setDrawerRow(null)}
        onEnqueue={(row) => void handleEnqueueOne(row)}
        onEscalate={handleEscalate}
        onMarkStatus={handleMarkStatus}
      />

      {/* Bulk dialog */}
      <BulkCallQueueDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={() => void handleConfirmBulk()}
        rows={selectedRows}
        isSending={isSending}
      />
    </div>
  );
}
