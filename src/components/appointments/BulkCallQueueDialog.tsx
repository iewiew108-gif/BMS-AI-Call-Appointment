// =============================================================================
// BulkCallQueueDialog — confirmation modal before sending rows into the AI queue
// =============================================================================

import { AlertTriangle, PhoneCall } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { EnrichedAppointment } from '@/hooks/useAppointments';

interface BulkCallQueueDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  rows: EnrichedAppointment[];
  isSending: boolean;
}

export function BulkCallQueueDialog({
  open,
  onClose,
  onConfirm,
  rows,
  isSending,
}: BulkCallQueueDialogProps) {
  const eligible = rows.filter((r) => r.cid && /^\d{13}$/.test(r.cid));
  const missingCid = rows.length - eligible.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-blue-600" />
            ส่งเข้าคิว AI โทร
          </DialogTitle>
          <DialogDescription>
            AI จะส่ง LINE Flex Message เชิญคนไข้เข้าคุยผ่านหมอพร้อม
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-slate-900">เลือก {rows.length} รายการ</p>
            <p className="mt-1 text-xs text-slate-600">
              ส่งได้ {eligible.length} รายการ (มี CID ครบ 13 หลัก)
            </p>
          </div>

          {missingCid > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">มี {missingCid} รายการที่ไม่มี CID</p>
                <p className="mt-0.5">ระบบจะข้ามไป — โปรดให้พยาบาลโทรเอง</p>
              </div>
            </div>
          )}

          <ul className="max-h-40 overflow-auto rounded-md border border-slate-200 text-xs">
            {eligible.slice(0, 10).map((r) => (
              <li key={r.oappId} className="border-b border-slate-100 px-3 py-1.5 last:border-b-0">
                <span className="font-mono">{r.hn}</span> — {r.patientName}
              </li>
            ))}
            {eligible.length > 10 && (
              <li className="px-3 py-1.5 text-slate-500">…และอีก {eligible.length - 10} รายการ</li>
            )}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            ยกเลิก
          </Button>
          <Button
            onClick={onConfirm}
            disabled={eligible.length === 0 || isSending}
            className="gap-1.5"
          >
            <PhoneCall className="h-4 w-4" />
            {isSending ? 'กำลังส่ง...' : `ยืนยันส่ง ${eligible.length} รายการ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
