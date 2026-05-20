// =============================================================================
// UrgentCallback — หน้าส่งเรื่องเร่งด่วนให้พยาบาลติดต่อกลับ
// สำหรับเจ้าหน้าที่ทะเบียน กรอกข้อมูลผู้ป่วยที่ต้องการให้พยาบาลติดต่อกลับโดยด่วน
// =============================================================================

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle, PhoneCall, Clock, CheckCircle2, XCircle, Loader2,
  Plus, Trash2, Bell, BellRing, History, ChevronDown,
  Search, RotateCcw,
} from 'lucide-react';
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
import { EscalatedCasesSection, type EscalatedCallbackSeed } from '@/components/appointments/EscalatedCasesSection';

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
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden req-card-${req.priority}`}
    >
      {/* Header row */}
      <div className={`px-4 pt-3 pb-2 flex items-start justify-between gap-2 ${pCfg.bg}`}>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-slate-900 leading-tight truncate">{req.patientName}</p>
          {req.hn && <p className="text-xs text-slate-500 font-mono mt-0.5">HN {req.hn}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pCfg.color} ${pCfg.bg} border ${pCfg.border}`}>
            {pCfg.label}
          </span>
          <Badge variant={sCfg.variant} className="flex items-center gap-1 text-xs">
            {sCfg.icon}{sCfg.label}
          </Badge>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Phone + ward row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <PhoneCall className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-sm font-mono font-semibold text-slate-800">{req.phone}</span>
          </div>
          {req.ward && (
            <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              {req.ward}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {elapsedLabel(req.createdAt)}
          </span>
        </div>

        {/* Reason */}
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-500 mb-0.5">เหตุผล / อาการ</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{req.reason}</p>
        </div>

        {req.resolvedBy && (
          <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-slate-700">
            <span className="font-medium text-green-700">พยาบาล: </span>{req.resolvedBy}
            {req.resolvedNote && <> — {req.resolvedNote}</>}
            <span className="ml-2 text-xs text-slate-400">{formatDateTime(req.updatedAt)}</span>
          </div>
        )}

        {/* Actions */}
        {req.status !== 'done' && req.status !== 'cancelled' && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {req.status === 'pending' && (
              <Button
                size="sm"
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                onClick={() => onUpdateStatus(req.id, 'in_progress')}
              >
                <PhoneCall className="h-3.5 w-3.5" />
                รับเรื่อง
              </Button>
            )}
            {!showResolve ? (
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs"
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
                  className="text-sm h-9"
                  autoFocus
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
              variant="outline"
              className="gap-1 border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 text-xs ml-auto"
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
            className="gap-1 text-xs text-slate-400 hover:text-red-500"
            onClick={() => onDelete(req.id)}
          >
            <Trash2 className="h-3 w-3" />
            ลบออก
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryPanel — 2-column master-detail layout สำหรับประวัติการติดต่อ
// ---------------------------------------------------------------------------

// LEFT column: one patient row
interface PatientListRowProps {
  req: UrgentCallbackRequest;
  isSelected: boolean;
  onClick: () => void;
}

function PatientListRow({ req, isSelected, onClick }: PatientListRowProps) {
  const sCfg = STATUS_CONFIG[req.status];
  const pCfg = PRIORITY_CONFIG[req.priority];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-slate-100 last:border-0 transition-all ${
        isSelected
          ? 'bg-blue-50 shadow-[inset_4px_0_0_0_#3b82f6]'
          : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 border-2 ${
          req.status === 'done'
            ? 'bg-green-400 border-green-300'
            : req.status === 'cancelled'
              ? 'bg-slate-300 border-slate-200'
              : 'bg-red-400 border-red-300'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <span className={`text-sm font-semibold leading-tight truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
              {req.patientName}
            </span>
            <Badge variant={sCfg.variant} className="flex items-center gap-0.5 text-[10px] py-0 h-4 shrink-0 ml-1">
              {sCfg.icon}
              <span className="hidden sm:inline">{sCfg.label}</span>
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {req.hn && <span className="text-xs text-slate-400 font-mono">HN {req.hn}</span>}
            {req.phone && (
              <span className="text-xs text-slate-500 font-mono">{req.phone}</span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            {req.resolvedBy
              ? <span className="text-xs text-green-600 font-medium truncate max-w-[140px]">✓ {req.resolvedBy}</span>
              : <span className={`text-xs font-medium ${pCfg.color}`}>{pCfg.label}</span>
            }
            <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(req.updatedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// RIGHT column: full detail of selected item
interface HistoryDetailProps {
  req: UrgentCallbackRequest;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}

function HistoryDetail({ req, onReopen, onDelete }: HistoryDetailProps) {
  const pCfg = PRIORITY_CONFIG[req.priority];
  const sCfg = STATUS_CONFIG[req.status];
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-tight">{req.patientName}</h3>
            {req.hn && <p className="text-sm text-slate-500 font-mono mt-0.5">HN {req.hn}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.color} border ${pCfg.border}`}>
              {pCfg.label}
            </span>
            <Badge variant={sCfg.variant} className="flex items-center gap-1 text-xs">
              {sCfg.icon}{sCfg.label}
            </Badge>
          </div>
        </div>

        {/* Phone — prominent */}
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 shrink-0">
            <PhoneCall className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">เบอร์โทรติดต่อ</p>
            <p className="text-base font-mono font-bold text-slate-800 tracking-wide">{req.phone || '—'}</p>
          </div>
          {req.ward && (
            <>
              <div className="w-px h-8 bg-slate-200 mx-1" />
              <div>
                <p className="text-xs text-slate-500">วอร์ด / แผนก</p>
                <p className="text-sm font-medium text-slate-700">{req.ward}</p>
              </div>
            </>
          )}
        </div>

        {/* Reason */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">เหตุผล / อาการ</p>
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{req.reason}</p>
          </div>
        </div>

        {/* Nurse result */}
        {(req.resolvedBy || req.resolvedNote) && (
          <div>
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">ผลการติดต่อ</p>
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 space-y-1">
              {req.resolvedBy && (
                <p className="text-sm font-semibold text-green-800">
                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-green-500" />
                  {req.resolvedBy}
                </p>
              )}
              {req.resolvedNote && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.resolvedNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-slate-100 pt-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />สร้างเมื่อ {formatDateTime(req.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-400" />อัปเดต {formatDateTime(req.updatedAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="gap-1.5 border-slate-200" onClick={() => onReopen(req.id)}>
            <RotateCcw className="h-3.5 w-3.5" />เปิดเรื่องใหม่
          </Button>
          <Button
            size="sm" variant="ghost"
            className="gap-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 ml-auto"
            onClick={() => onDelete(req.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />ลบออก
          </Button>
        </div>
      </div>
    </div>
  );
}

// Main 2-column panel
interface HistoryPanelProps {
  items: UrgentCallbackRequest[];
  onUpdateStatus: (id: string, status: UrgentCallbackStatus) => void;
  onDelete: (id: string) => void;
}

function HistoryPanel({ items, onUpdateStatus, onDelete }: HistoryPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'done' | 'cancelled'>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.patientName.toLowerCase().includes(q) ||
        r.hn.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        (r.ward ?? '').toLowerCase().includes(q) ||
        (r.resolvedBy ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, filter]);

  // Keep selection valid; auto-select first row when current selection leaves the list
  const activeId = useMemo(() => {
    if (selectedId && filtered.some((r) => r.id === selectedId)) return selectedId;
    return filtered[0]?.id ?? null;
  }, [filtered, selectedId]);

  const activeReq = useMemo(
    () => filtered.find((r) => r.id === activeId) ?? null,
    [filtered, activeId],
  );

  const handleReopen = (id: string) => { onUpdateStatus(id, 'pending'); setSelectedId(null); };
  const handleDelete = (id: string) => { onDelete(id); setSelectedId(null); };

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">ประวัติการติดต่อ</span>
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold">
            {items.length}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
      </button>

      {!collapsed && (
        <div className="hist-grid">
          {/* ── LEFT: patient list ───────────────────────── */}
          <div className="hist-left">
            <div className="p-3 space-y-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ค้นหา ชื่อ / HN / เบอร์..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 focus:bg-white"
                />
              </div>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                {(['all', 'done', 'cancelled'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-1.5 font-medium transition-colors ${
                      filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {f === 'all' ? 'ทั้งหมด' : f === 'done' ? 'ติดต่อแล้ว' : 'ยกเลิก'}
                  </button>
                ))}
              </div>
            </div>
            <div className="hist-list-scroll">
              {filtered.length === 0
                ? <p className="p-6 text-center text-sm text-slate-400">ไม่พบรายการ</p>
                : filtered.map((req) => (
                    <PatientListRow
                      key={req.id}
                      req={req}
                      isSelected={req.id === activeId}
                      onClick={() => setSelectedId(req.id)}
                    />
                  ))
              }
            </div>
          </div>

          {/* ── RIGHT: detail ────────────────────────────── */}
          <div className="hist-right">
            {activeReq
              ? <HistoryDetail req={activeReq} onReopen={handleReopen} onDelete={handleDelete} />
              : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 p-8 text-center">
                  <History className="h-10 w-10 opacity-20" />
                  <p className="text-sm">เลือกรายชื่อผู้ป่วยเพื่อดูรายละเอียด</p>
                </div>
              )
            }
          </div>
        </div>
      )}

      <style>{`
        .hist-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          min-height: 420px;
          height: calc(100vh - 280px);
          max-height: 780px;
          border-top: 1px solid #f1f5f9;
        }
        .hist-left {
          display: flex;
          flex-direction: column;
          border-right: 1px solid #f1f5f9;
          overflow: hidden;
        }
        .hist-list-scroll {
          overflow-y: auto;
          flex: 1;
        }
        .hist-right {
          overflow-y: auto;
          background: #f8fafc;
        }
        @media (max-width: 768px) {
          .hist-grid {
            grid-template-columns: 1fr;
            height: auto;
            max-height: none;
          }
          .hist-left {
            border-right: none;
            border-bottom: 1px solid #f1f5f9;
            max-height: 280px;
          }
          .hist-right { max-height: 480px; }
        }
      `}</style>
    </section>
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

  const handleCreateFromEscalated = useCallback((seed: EscalatedCallbackSeed) => {
    setForm({
      hn: seed.hn,
      patientName: seed.patientName,
      phone: seed.phone,
      reason: seed.reason,
      priority: seed.priority,
      ward: seed.ward,
    });
    setErrors({});
    setShowForm(true);
    // Scroll to form
    setTimeout(() => {
      document.getElementById('urgent-callback-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  return (
    <div className="space-y-6 pb-12">
    <div className="mx-auto max-w-3xl px-2 sm:px-4 space-y-6">
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

      {/* Escalated cases from AI confirm-call */}
      <EscalatedCasesSection onCreateCallback={handleCreateFromEscalated} />

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'รอพยาบาล', value: requests.filter((r) => r.status === 'pending').length, Icon: Bell, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-100' },
          { label: 'กำลังติดต่อ', value: requests.filter((r) => r.status === 'in_progress').length, Icon: PhoneCall, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100' },
          { label: 'ติดต่อแล้ว', value: requests.filter((r) => r.status === 'done').length, Icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', iconBg: 'bg-green-100' },
        ] as const).map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4 flex items-center gap-3`}>
            <div className={`rounded-lg ${kpi.iconBg} p-2.5 shrink-0`}>
              <kpi.Icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold leading-none ${kpi.color}`}>{kpi.value}</p>
              <p className="mt-1 text-xs text-slate-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div id="urgent-callback-form" className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm space-y-4">
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

    </div>

    <style>{`
      .req-card-critical { border-left: 4px solid #dc2626; }
      .req-card-high     { border-left: 4px solid #ea580c; }
    `}</style>

    {/* ประวัติการติดต่อ — full-width 2-column master-detail */}
    <div className="px-2 sm:px-4">
      <HistoryPanel
        items={resolved}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDelete}
      />
    </div>
    </div>
  );
}
