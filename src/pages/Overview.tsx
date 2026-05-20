// =============================================================================
// Overview — Dashboard สรุปการโทรยืนยันนัด
// =============================================================================

import { useMemo, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  PhoneCall, CheckCircle2, AlertTriangle,
  BellRing, Clock, ArrowRight, Phone, Activity,
  Loader2, PhoneOff, PhoneMissed, RotateCcw,
} from 'lucide-react';
import { getAllCallAttempts, subscribeCallAttempts } from '@/services/callAttempts';
import { getAllUrgentCallbacks, subscribeUrgentCallbacks } from '@/services/urgentCallbacks';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { AnimatedMedIcon } from '@/components/ui/AnimatedMedIcon';
import { Hospital, PawPrint } from 'lucide-react';
import type { CallStatus } from '@/types/appointment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatThaiDate(): string {
  return new Date().toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'เมื่อกี้';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hr / 24)} วันที่แล้ว`;
}

// ---------------------------------------------------------------------------
// Config: status display & colors
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<CallStatus, string> = {
  pending:        'รอโทร',
  queued:         'อยู่ในคิว AI',
  calling:        'กำลังโทร',
  confirmed:      'ยืนยันนัดแล้ว',
  rescheduled:    'เลื่อนนัด',
  cancelled:      'ยกเลิก',
  no_answer:      'ไม่รับสาย',
  escalated:      'ส่งต่อพยาบาล',
  already_visited:'มาแล้ว',
};

const STATUS_COLOR: Record<CallStatus, string> = {
  confirmed:      '#22c55e',
  already_visited:'#14b8a6',
  calling:        '#3b82f6',
  queued:         '#6366f1',
  pending:        '#94a3b8',
  rescheduled:    '#eab308',
  no_answer:      '#f97316',
  escalated:      '#ef4444',
  cancelled:      '#9ca3af',
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;      // Tailwind text color
  bg: string;         // Tailwind bg
  border: string;     // Tailwind border
  iconBg: string;
  sublabel?: string;
}

function KpiCard({ label, value, icon, color, bg, border, iconBg, sublabel }: KpiCardProps) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 flex items-center gap-3`}>
      <div className={`rounded-lg ${iconBg} p-2.5 shrink-0`}>
        <div className={color}>{icon}</div>
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-none ${color}`}>{value.toLocaleString()}</p>
        <p className="mt-1 text-xs font-medium text-slate-600 leading-tight">{label}</p>
        {sublabel && <p className="text-[10px] text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip for PieChart
// ---------------------------------------------------------------------------

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-800">{d.name}</p>
      <p className="text-slate-600">{d.value} รายการ ({d.payload.pct}%)</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Overview() {
  const { session } = useBmsSessionContext();
  const userName = session?.userInfo.name ?? 'ผู้ใช้';

  // Live stores
  const attempts = useSyncExternalStore(subscribeCallAttempts, getAllCallAttempts);
  const callbacks = useSyncExternalStore(subscribeUrgentCallbacks, getAllUrgentCallbacks);

  // ── Call Attempts KPIs ─────────────────────────────────────────────────
  const today = todayIso();

  const callKpi = useMemo(() => {
    const todayAttempts = attempts.filter((a) => a.updatedAt.startsWith(today));
    const count = (s: CallStatus) => attempts.filter((a) => a.status === s).length;
    const countToday = (s: CallStatus) => todayAttempts.filter((a) => a.status === s).length;

    return {
      total:    attempts.length,
      todayTotal: todayAttempts.length,
      confirmed:  count('confirmed'),
      noAnswer:   count('no_answer'),
      escalated:  count('escalated'),
      calling:    count('calling') + count('queued'),
      rescheduled: count('rescheduled'),
      cancelled:  count('cancelled'),
      todayConfirmed: countToday('confirmed'),
      todayNoAnswer:  countToday('no_answer'),
      todayEscalated: countToday('escalated'),
    };
  }, [attempts, today]);

  // ── Urgent Callbacks KPIs ──────────────────────────────────────────────
  const urgentKpi = useMemo(() => ({
    pending:    callbacks.filter((c) => c.status === 'pending').length,
    inProgress: callbacks.filter((c) => c.status === 'in_progress').length,
    done:       callbacks.filter((c) => c.status === 'done').length,
    cancelled:  callbacks.filter((c) => c.status === 'cancelled').length,
  }), [callbacks]);

  // ── Pie chart data ─────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const statuses: CallStatus[] = [
      'confirmed', 'no_answer', 'escalated', 'calling', 'queued',
      'rescheduled', 'pending', 'cancelled', 'already_visited',
    ];
    const total = attempts.length || 1;
    return statuses
      .map((s) => {
        const value = attempts.filter((a) => a.status === s).length;
        return {
          name: STATUS_LABEL[s],
          value,
          color: STATUS_COLOR[s],
          pct: Math.round((value / total) * 100),
        };
      })
      .filter((d) => d.value > 0);
  }, [attempts]);

  // ── Bar chart: today vs yesterday ─────────────────────────────────────
  const barData = useMemo(() => {
    const yday = new Date();
    yday.setDate(yday.getDate() - 1);
    const yIso = yday.toISOString().slice(0, 10);

    const todayCount   = (s: CallStatus) => attempts.filter((a) => a.status === s && a.updatedAt.startsWith(today)).length;
    const ydayCount    = (s: CallStatus) => attempts.filter((a) => a.status === s && a.updatedAt.startsWith(yIso)).length;

    return [
      { name: 'ยืนยัน',     วันนี้: todayCount('confirmed'),   เมื่อวาน: ydayCount('confirmed') },
      { name: 'ไม่รับสาย',  วันนี้: todayCount('no_answer'),   เมื่อวาน: ydayCount('no_answer') },
      { name: 'Escalate',   วันนี้: todayCount('escalated'),   เมื่อวาน: ydayCount('escalated') },
      { name: 'เลื่อนนัด',  วันนี้: todayCount('rescheduled'), เมื่อวาน: ydayCount('rescheduled') },
    ];
  }, [attempts, today]);

  // ── Recent escalated (top 5) ───────────────────────────────────────────
  const recentEscalated = useMemo(
    () => attempts
      .filter((a) => a.status === 'escalated')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5),
    [attempts],
  );

  // ── Pending urgent (top 5) ─────────────────────────────────────────────
  const pendingUrgent = useMemo(
    () => callbacks
      .filter((c) => c.status === 'pending' || c.status === 'in_progress')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    [callbacks],
  );

  const hasAlerts = recentEscalated.length > 0 || pendingUrgent.length > 0;

  return (
    <div className="mx-auto max-w-screen-xl px-3 sm:px-6 pb-16 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="pt-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <AnimatedMedIcon
            hospitalIcon={Hospital}
            vetIcon={PawPrint}
            animation="heartbeat"
            color="text-blue-500"
            size="lg"
          />
          <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 mb-2">
            <Activity className="h-3 w-3" />
            AI ผู้ช่วยพยาบาล • หมอพร้อม
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard สรุปการโทรยืนยันนัด
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            สวัสดี <span className="font-medium text-slate-700">{userName}</span>
            {' — '}{formatThaiDate()}
          </p>
          </div>
        </div>
        <Link
          to="/appointments"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <PhoneCall className="h-4 w-4" />
          ไปยังทะเบียนนัด
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="ติดตามทั้งหมด"
          value={callKpi.total}
          icon={<Phone className="h-5 w-5" />}
          color="text-slate-700" bg="bg-slate-50" border="border-slate-200" iconBg="bg-slate-100"
          sublabel={`วันนี้ ${callKpi.todayTotal} ราย`}
        />
        <KpiCard
          label="ยืนยันนัดแล้ว"
          value={callKpi.confirmed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-green-600" bg="bg-green-50" border="border-green-200" iconBg="bg-green-100"
          sublabel={`วันนี้ ${callKpi.todayConfirmed} ราย`}
        />
        <KpiCard
          label="ไม่รับสาย"
          value={callKpi.noAnswer}
          icon={<PhoneMissed className="h-5 w-5" />}
          color="text-orange-600" bg="bg-orange-50" border="border-orange-200" iconBg="bg-orange-100"
          sublabel={`วันนี้ ${callKpi.todayNoAnswer} ราย`}
        />
        <KpiCard
          label="Escalate รอพยาบาล"
          value={callKpi.escalated}
          icon={<AlertTriangle className="h-5 w-5" />}
          color="text-red-600" bg="bg-red-50" border="border-red-200" iconBg="bg-red-100"
          sublabel={`วันนี้ ${callKpi.todayEscalated} ราย`}
        />
        <KpiCard
          label="กำลังโทร / คิว"
          value={callKpi.calling}
          icon={<Loader2 className="h-5 w-5" />}
          color="text-blue-600" bg="bg-blue-50" border="border-blue-200" iconBg="bg-blue-100"
        />
        <KpiCard
          label="แจ้งพยาบาลด่วน"
          value={urgentKpi.pending + urgentKpi.inProgress}
          icon={<BellRing className="h-5 w-5" />}
          color="text-rose-600" bg="bg-rose-50" border="border-rose-200" iconBg="bg-rose-100"
          sublabel={urgentKpi.done > 0 ? `ติดต่อแล้ว ${urgentKpi.done} ราย` : undefined}
        />
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pie chart: call status breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            สัดส่วนสถานะการโทร AI (ทั้งหมด)
          </h2>
          {attempts.length === 0 ? (
            <EmptyChart message="ยังไม่มีข้อมูลการโทร" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-slate-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar chart: today vs yesterday */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-indigo-500" />
            เปรียบเทียบวันนี้ vs เมื่อวาน
          </h2>
          {attempts.length === 0 ? (
            <EmptyChart message="ยังไม่มีข้อมูลการโทร" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={24} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                <Bar dataKey="วันนี้"   fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="เมื่อวาน" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Urgent Callbacks Summary ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-rose-500" />
            สรุปงานแจ้งพยาบาลด่วน
          </h2>
          <Link to="/urgent-callback" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
          {[
            { label: 'รอพยาบาล',    value: urgentKpi.pending,    color: 'text-red-600',    bg: 'bg-red-50' },
            { label: 'กำลังติดต่อ', value: urgentKpi.inProgress, color: 'text-blue-600',   bg: 'bg-blue-50' },
            { label: 'ติดต่อแล้ว',  value: urgentKpi.done,       color: 'text-green-600',  bg: 'bg-green-50' },
            { label: 'ยกเลิก',      value: urgentKpi.cancelled,  color: 'text-slate-500',  bg: 'bg-slate-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} px-5 py-4 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alert Section ───────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Escalated cases */}
          {recentEscalated.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-red-50 border-b border-red-100">
                <h2 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Escalate — รอพยาบาล ({callKpi.escalated})
                </h2>
                <Link to="/urgent-callback" className="text-xs text-red-600 hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {recentEscalated.map((a) => (
                  <div key={a.oappId} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-red-100 shrink-0">
                      <PhoneOff className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        oapp #{a.oappId}
                      </p>
                      {a.reason && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{a.reason}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                      {elapsedLabel(a.updatedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending urgent callbacks */}
          {pendingUrgent.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-rose-50 border-b border-rose-100">
                <h2 className="text-sm font-semibold text-rose-800 flex items-center gap-2">
                  <BellRing className="h-4 w-4" />
                  แจ้งพยาบาลด่วน — รอดำเนินการ ({urgentKpi.pending + urgentKpi.inProgress})
                </h2>
                <Link to="/urgent-callback" className="text-xs text-rose-600 hover:underline flex items-center gap-1">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {pendingUrgent.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                      c.priority === 'critical' ? 'bg-red-100' : 'bg-orange-100'
                    }`}>
                      <BellRing className={`h-3.5 w-3.5 ${c.priority === 'critical' ? 'text-red-500' : 'text-orange-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.patientName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.hn && <span className="text-[10px] font-mono text-slate-400">HN {c.hn}</span>}
                        <span className="text-xs text-slate-500 font-mono">{c.phone}</span>
                      </div>
                      {c.reason && <p className="text-xs text-slate-500 truncate mt-0.5">{c.reason}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        c.priority === 'critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                      }`}>
                        {c.priority === 'critical' ? 'เร่งด่วนมาก' : 'เร่งด่วน'}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">{formatTime(c.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/appointments" className="quick-action-card group border-blue-100 hover:border-blue-300 hover:bg-blue-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 group-hover:bg-blue-200 transition-colors">
              <PhoneCall className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">AI โทรยืนยันนัด</p>
              <p className="text-xs text-slate-500">ทะเบียนนัดผู้ป่วย + ส่งคิว AI</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
        </Link>

        <Link to="/urgent-callback" className="quick-action-card group border-rose-100 hover:border-rose-300 hover:bg-rose-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-100 group-hover:bg-rose-200 transition-colors">
              <BellRing className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">แจ้งพยาบาลด่วน</p>
              <p className="text-xs text-slate-500">
                {urgentKpi.pending + urgentKpi.inProgress > 0
                  ? `มี ${urgentKpi.pending + urgentKpi.inProgress} เรื่องรอดำเนินการ`
                  : 'ส่งเรื่องเร่งด่วนให้พยาบาล'
                }
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-rose-500 transition-colors" />
        </Link>

        <Link to="/settings" className="quick-action-card group border-slate-100 hover:border-slate-300 hover:bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
              <RotateCcw className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">ตั้งค่าระบบ</p>
              <p className="text-xs text-slate-500">ปรับแต่งการแจ้งเตือน popup</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </Link>
      </div>

      {/* ── Empty state when no data ─────────────────────────────────────── */}
      {attempts.length === 0 && callbacks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <Phone className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">ยังไม่มีข้อมูลการโทร</p>
          <p className="mt-1 text-xs text-slate-400">
            ไปที่เมนู "AI โทรยืนยันนัด" เพื่อเริ่มส่งรายชื่อให้ AI โทร
          </p>
        </div>
      )}

      <style>{`
        .quick-action-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 14px;
          border-width: 1px;
          border-style: solid;
          background: white;
          text-decoration: none;
          transition: all 0.15s;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyChart helper
// ---------------------------------------------------------------------------

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[240px] text-slate-400">
      <Clock className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
      <p className="text-xs mt-1">ข้อมูลจะแสดงเมื่อเริ่มส่งคิว AI</p>
    </div>
  );
}
