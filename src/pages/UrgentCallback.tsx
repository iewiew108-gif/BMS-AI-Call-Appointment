// =============================================================================
// UrgentCallback — หน้าส่งเรื่องเร่งด่วนให้พยาบาลติดต่อกลับ
// สำหรับเจ้าหน้าที่ทะเบียน กรอกข้อมูลผู้ป่วยที่ต้องการให้พยาบาลติดต่อกลับโดยด่วน
// =============================================================================

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, PhoneCall, Clock, CheckCircle2, XCircle, Loader2, Plus, Trash2, Bell, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  getAllUrgentCallbacks,
  createUrgentCallback,
  updateUrgentCallbackStatus,
  deleteUrgentCallback,
  subscribeUrgentCallbacks,
} from '@/services/urgentCallbacks';
import type { UrgentCallbackRequest, UrgentCallbackPriority, UrgentCallbackStatus } from '@/types/urgentCallback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  return `${hr} ชั่วโมงที่แล้ว`;
}

const PRIORITY_CONFIG: Record<UrgentCallbackPriority, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'เร่งด่วนมาก', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  high:     { label: 'เร่งด่วน',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};

const STATUS_CONFIG: Record<UrgentCallbackStatus, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:     { label: 'รอพยาบาล',     icon: <Bell className="h-3 w-3" />, variant: 'destructive' },
  in_progress: { label: 'กำลังติดต่อ',  icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: 'default' },
  done:        { label: 'ติดต่อแล้ว',   icon: <CheckCircle2 className="h-3 w-3" />, variant: 'secondary' },
  cancelled:   { label: 'ยกเลิก',       icon: <XCircle className="h-3 w-3" />, variant: 'outline' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RequestCardProps {
  req: UrgentCallbackRequest;
  onUpdateStatus: (id: string, status: UrgentCallbackStatus, note?: string) => void;
  onDelete: (id: string) => void;
}

function RequestCard({ req, onUpdateStatus, onDelete }: RequestCardProps) {
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const pCfg = PRIORITY_CONFIG[req.priority];
  const sCfg = STATUS_CONFIG[req.status];

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${pCfg.bg} ${pCfg.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={sCfg.variant} className="flex items-center gap-1">
            {sCfg.icon}
            {sCfg.label}
          </Badge>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.color} border ${pCfg.border}`}>
            {pCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
          <Clock className="h-3 w-3" />
          {elapsedLabel(req.createdAt)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-xs text-slate-500">HN</span>
          <p className="font-medium">{req.hn || '—'}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">ชื่อผู้ป่วย</span>
          <p className="font-medium">{req.patientName}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">เบอร์โทร</span>
          <p className="font-medium font-mono">{req.phone}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">วอร์ด/แผนก</span>
          <p className="font-medium">{req.ward || '—'}</p>
        </div>
      </div>

      <div className="mt-2">
        <span className="text-xs text-slate-500">เหตุผล / อาการ</span>
        <p className="text-sm mt-0.5 text-slate-800 whitespace-pre-wrap">{req.reason}</p>
      </div>

      {req.resolvedBy && (
        <div className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium">พยาบาล: </span>{req.resolvedBy}
          {req.resolvedNote && <> — {req.resolvedNote}</>}
          <span className="ml-2 text-slate-400">{formatDateTime(req.updatedAt)}</span>
        </div>
      )}

      {req.status !== 'done' && req.status !== 'cancelled' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {req.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              onClick={() => onUpdateStatus(req.id, 'in_progress')}
            >
              <PhoneCall className="h-3.5 w-3.5" />
              รับเรื่อง
            </Button>
          )}
          {!showResolve ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-green-300 text-green-700 hover:bg-green-100 text-xs"
              onClick={() => setShowResolve(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              ติดต่อแล้ว
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Input
                placeholder="ชื่อพยาบาล / หมายเหตุ"
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                className="text-xs h-8"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1 bg-green-600 hover:bg-green-700 text-xs"
                  onClick={() => {
                    onUpdateStatus(req.id, 'done', resolveNote);
                    setShowResolve(false);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  บันทึก
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowResolve(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-slate-400 hover:text-red-500 text-xs"
            onClick={() => onUpdateStatus(req.id, 'cancelled')}
          >
            <XCircle className="h-3.5 w-3.5" />
            ยกเลิก
          </Button>
        </div>
      )}

      {(req.status === 'done' || req.status === 'cancelled') && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 gap-1 text-xs text-slate-400 hover:text-red-500"
          onClick={() => onDelete(req.id)}
        >
          <Trash2 className="h-3 w-3" />
          ลบออก
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

interface FormState {
  hn: string;
  patientName: string;
  phone: string;
  reason: string;
  priority: UrgentCallbackPriority;
  ward: string;
}

const EMPTY_FORM: FormState = {
  hn: '', patientName: '', phone: '', reason: '', priority: 'high', ward: '',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UrgentCallback() {
  const requests = useSyncExternalStore(subscribeUrgentCallbacks, getAllUrgentCallbacks);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const pending = useMemo(
    () => requests.filter((r) => r.status === 'pending' || r.status === 'in_progress'),
    [requests],
  );
  const resolved = useMemo(
    () => requests.filter((r) => r.status === 'done' || r.status === 'cancelled'),
    [requests],
  );

  const validate = useCallback((): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.patientName.trim()) errs.patientName = 'กรุณากรอกชื่อผู้ป่วย';
    if (!form.phone.trim()) errs.phone = 'กรุณากรอกเบอร์โทร';
    if (!form.reason.trim()) errs.reason = 'กรุณาระบุเหตุผล';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;
    createUrgentCallback({
      hn: form.hn,
      patientName: form.patientName,
      phone: form.phone,
      reason: form.reason,
      priority: form.priority,
      ward: form.ward,
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
  }, [form, validate]);

  const handleUpdateStatus = useCallback(
    (id: string, status: UrgentCallbackStatus, note?: string) => {
      updateUrgentCallbackStatus(id, status, { resolvedNote: note });
    },
    [],
  );

  const handleDelete = useCallback((id: string) => {
    deleteUrgentCallback(id);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 pb-12 sm:px-4">
      {/* Hero */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              <BellRing className="h-3 w-3" />
              งานทะเบียน • ด่วน
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              แจ้งพยาบาลติดต่อกลับด่วน
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              สำหรับเจ้าหน้าที่ทะเบียน — บันทึกผู้ป่วยที่ต้องการให้พยาบาลติดต่อกลับโดยเร่งด่วน
            </p>
          </div>

          <Button
            onClick={() => setShowForm((v) => !v)}
            className="gap-2 bg-red-600 hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            แจ้งเรื่องใหม่
          </Button>
        </div>
      </header>

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'รอพยาบาล', value: requests.filter((r) => r.status === 'pending').length, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
          { label: 'กำลังติดต่อ', value: requests.filter((r) => r.status === 'in_progress').length, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'ติดต่อแล้ว (วันนี้)', value: requests.filter((r) => r.status === 'done').length, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4 text-center`}>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4" />
            บันทึกเรื่องแจ้งพยาบาล
          </h2>

          {/* Priority toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">ระดับความเร่งด่วน</label>
            <div className="flex gap-2">
              {(['high', 'critical'] as UrgentCallbackPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, priority: p }))}
                  className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                    form.priority === p
                      ? p === 'critical'
                        ? 'border-red-400 bg-red-600 text-white'
                        : 'border-orange-400 bg-orange-500 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">HN (ถ้ามี)</label>
              <Input
                placeholder="เช่น 00001234"
                value={form.hn}
                onChange={(e) => setForm((f) => ({ ...f, hn: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                ชื่อ-นามสกุล <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="นาย/นาง/นางสาว..."
                value={form.patientName}
                onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                className={errors.patientName ? 'border-red-400' : ''}
              />
              {errors.patientName && <p className="mt-0.5 text-xs text-red-500">{errors.patientName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                เบอร์โทรติดต่อ <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="08x-xxx-xxxx"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={errors.phone ? 'border-red-400' : ''}
              />
              {errors.phone && <p className="mt-0.5 text-xs text-red-500">{errors.phone}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">วอร์ด / แผนก</label>
              <Input
                placeholder="เช่น OPD อายุรกรรม"
                value={form.ward}
                onChange={(e) => setForm((f) => ({ ...f, ward: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              เหตุผล / อาการ / ความต้องการ <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder="ระบุอาการหรือเหตุผลที่ต้องให้พยาบาลติดต่อกลับโดยด่วน..."
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className={errors.reason ? 'border-red-400' : ''}
            />
            {errors.reason && <p className="mt-0.5 text-xs text-red-500">{errors.reason}</p>}
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} className="gap-2 bg-red-600 hover:bg-red-700">
              <BellRing className="h-4 w-4" />
              แจ้งพยาบาล
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setErrors({}); }}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {/* Pending list */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Bell className="h-4 w-4 text-red-500" />
            รอการติดต่อ ({pending.length})
          </h2>
          {pending.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}

      {pending.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-400" />
          <p className="mt-2 text-sm font-medium text-slate-600">ไม่มีเรื่องรอพยาบาล</p>
          <p className="text-xs text-slate-400">กดปุ่ม "แจ้งเรื่องใหม่" เพื่อส่งเรื่องเร่งด่วน</p>
        </div>
      )}

      {/* Resolved list */}
      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <CheckCircle2 className="h-4 w-4" />
            ดำเนินการแล้ว / ยกเลิก ({resolved.length})
          </h2>
          {resolved.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}
    </div>
  );
}
