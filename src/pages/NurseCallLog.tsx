// =============================================================================
// NurseCallLog — ทะเบียนสรุปการโทรติดตามพยาบาล
// ใช้ข้อมูลจาก urgentCallbacks (localStorage)
// =============================================================================

import { useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatedMedIcon } from '@/components/ui/AnimatedMedIcon';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, Bird,
  CheckCircle2, XCircle, Clock, Loader2, PhoneCall,
  Bell, BarChart2, TrendingUp, Users, Search, Filter,
} from 'lucide-react';
import { getAllUrgentCallbacks, subscribeUrgentCallbacks } from '@/services/urgentCallbacks';
import type { UrgentCallbackRequest, UrgentCallbackStatus } from '@/types/urgentCallback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTimeTH(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateTH(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

const STATUS_LABEL: Record<UrgentCallbackStatus, string> = {
  pending:     'รอดำเนินการ',
  in_progress: 'กำลังติดต่อ',
  done:        'ติดต่อสำเร็จ',
  cancelled:   'ยกเลิก',
};

const STATUS_BADGE: Record<UrgentCallbackStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending:     { variant: 'destructive', icon: <Bell className="h-3 w-3" /> },
  in_progress: { variant: 'default',     icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  done:        { variant: 'secondary',   icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled:   { variant: 'outline',     icon: <XCircle className="h-3 w-3" /> },
};

// ชื่อพยาบาลที่ใช้แสดง: resolvedBy (ผู้รับเรื่อง) ถ้าไม่มีใช้ assignedNurse
function nurseName(req: UrgentCallbackRequest): string {
  return req.resolvedBy?.trim() || req.assignedNurse?.trim() || 'ไม่ระบุพยาบาล';
}

// ---------------------------------------------------------------------------
// Nurse summary row type
// ---------------------------------------------------------------------------
interface NurseSummary {
  name: string;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  successRate: number;
  wards: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NurseCallLog() {
  const requests = useSyncExternalStore(subscribeUrgentCallbacks, getAllUrgentCallbacks);
  const [activeTab, setActiveTab] = useState<'summary' | 'log'>('summary');
  const [filterNurse, setFilterNurse] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | UrgentCallbackStatus>('all');
  const [searchText, setSearchText] = useState('');

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const nurseList = useMemo(() => {
    const names = new Set<string>();
    for (const r of requests) names.add(nurseName(r));
    return Array.from(names).sort();
  }, [requests]);

  const nurseSummaries = useMemo((): NurseSummary[] => {
    const map = new Map<string, UrgentCallbackRequest[]>();
    for (const r of requests) {
      const n = nurseName(r);
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(r);
    }
    return Array.from(map.entries())
      .map(([name, rows]) => {
        const done       = rows.filter((r) => r.status === 'done').length;
        const inProgress = rows.filter((r) => r.status === 'in_progress').length;
        const pending    = rows.filter((r) => r.status === 'pending').length;
        const cancelled  = rows.filter((r) => r.status === 'cancelled').length;
        const wards = Array.from(new Set(rows.map((r) => r.ward).filter(Boolean))) as string[];
        return {
          name, total: rows.length, done, inProgress, pending, cancelled,
          successRate: rows.length > 0 ? Math.round((done / rows.length) * 100) : 0,
          wards,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [requests]);

  const filteredLog = useMemo(() => {
    return requests.filter((r) => {
      if (filterNurse && nurseName(r) !== filterNurse) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          r.patientName.toLowerCase().includes(q) ||
          r.hn.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          (r.ward ?? '').toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [requests, filterNurse, filterStatus, searchText]);

  // Per-nurse sequence number in detail log
  const nurseSeqMap = useMemo(() => {
    const sorted = [...requests].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const counter = new Map<string, number>();
    const seqMap  = new Map<string, number>();
    for (const r of sorted) {
      const n = nurseName(r);
      const seq = (counter.get(n) ?? 0) + 1;
      counter.set(n, seq);
      seqMap.set(r.id, seq);
    }
    return seqMap;
  }, [requests]);

  // KPI
  const kpi = useMemo(() => ({
    total:       requests.length,
    done:        requests.filter((r) => r.status === 'done').length,
    active:      requests.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
    cancelled:   requests.filter((r) => r.status === 'cancelled').length,
    successRate: requests.length > 0
      ? Math.round((requests.filter((r) => r.status === 'done').length / requests.length) * 100)
      : 0,
  }), [requests]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-2 sm:px-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <AnimatedMedIcon
              hospitalIcon={ClipboardList}
              vetIcon={Bird}
              animation="float"
              color="text-indigo-500"
              size="md"
              className="mt-1 shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                <BarChart2 className="h-3 w-3" />
                สรุปยอดการติดตาม
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                ทะเบียนการโทรติดตามพยาบาล
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                สรุปยอดเคสที่รับมอบหมายและผลการติดต่อแยกตามพยาบาล
              </p>
            </div>
          </div>
        </header>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-2 sm:px-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {([
            { label: 'รายการทั้งหมด',   value: kpi.total,       Icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200', iconBg: 'bg-indigo-100' },
            { label: 'ติดต่อสำเร็จ',    value: kpi.done,        Icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200',  iconBg: 'bg-green-100'  },
            { label: 'รอดำเนินการ',     value: kpi.active,      Icon: PhoneCall,     color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200', iconBg: 'bg-orange-100' },
            { label: 'ยกเลิก',          value: kpi.cancelled,   Icon: XCircle,       color: 'text-slate-500',  bg: 'bg-slate-50',   border: 'border-slate-200',  iconBg: 'bg-slate-100'  },
            { label: 'อัตราสำเร็จ',    value: `${kpi.successRate}%`, Icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50',   border: 'border-blue-200',   iconBg: 'bg-blue-100'   },
          ] as const).map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-3.5 flex items-center gap-3`}>
              <div className={`rounded-lg ${kpi.iconBg} p-2 shrink-0`}>
                <kpi.Icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <div>
                <p className={`text-xl font-bold leading-none ${kpi.color}`}>{kpi.value}</p>
                <p className="mt-1 text-[10px] text-slate-500">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────── */}
      <div className="px-2 sm:px-4">
        <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit bg-slate-50">
          {([
            { id: 'summary', label: 'สรุปรายพยาบาล',    icon: Users       },
            { id: 'log',     label: 'ทะเบียนทั้งหมด',   icon: ClipboardList },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: สรุปรายพยาบาล ─────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="px-2 sm:px-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">
                สรุปยอดแยกตามพยาบาล ({nurseSummaries.length} คน)
              </span>
            </div>
            {nurseSummaries.length === 0 ? (
              <div className="py-12 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">ยังไม่มีข้อมูลการโทรติดตาม</p>
                <p className="text-xs text-slate-400 mt-1">เพิ่มเรื่องผ่านหน้า "แจ้งพยาบาลด่วน" ก่อน</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">#</th>
                      <th className="px-4 py-2.5 text-left">ชื่อพยาบาล</th>
                      <th className="px-4 py-2.5 text-left">วอร์ด / คลินิก</th>
                      <th className="px-4 py-2.5 text-center">รายการทั้งหมด</th>
                      <th className="px-4 py-2.5 text-center">ติดต่อสำเร็จ</th>
                      <th className="px-4 py-2.5 text-center">กำลังติดต่อ</th>
                      <th className="px-4 py-2.5 text-center">รอดำเนินการ</th>
                      <th className="px-4 py-2.5 text-center">ยกเลิก</th>
                      <th className="px-4 py-2.5 text-center">อัตราสำเร็จ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nurseSummaries.map((s, idx) => (
                      <tr
                        key={s.name}
                        className="hover:bg-indigo-50/30 transition cursor-pointer"
                        onClick={() => {
                          setFilterNurse(s.name === filterNurse ? '' : s.name);
                          setActiveTab('log');
                        }}
                      >
                        <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800">{s.name}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-[14rem]">
                          {s.wards.length === 0
                            ? <span className="text-slate-300">—</span>
                            : s.wards.join(', ')}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-indigo-700">{s.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
                            <CheckCircle2 className="h-3 w-3" />{s.done}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            <Loader2 className="h-3 w-3" />{s.inProgress}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-semibold text-orange-700">
                            <Clock className="h-3 w-3" />{s.pending}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                            <XCircle className="h-3 w-3" />{s.cancelled}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-sm font-bold ${s.successRate >= 70 ? 'text-green-600' : s.successRate >= 40 ? 'text-orange-500' : 'text-red-500'}`}>
                              {s.successRate}%
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${s.successRate >= 70 ? 'bg-green-500' : s.successRate >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                                style={{ width: `${s.successRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 px-1">* กดที่แถวพยาบาลเพื่อดูรายละเอียดทะเบียนของพยาบาลคนนั้น</p>
        </div>
      )}

      {/* ── Tab: ทะเบียนทั้งหมด ────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="px-2 sm:px-4 space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="ค้นหา ชื่อ / HN / เบอร์ / เหตุผล..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <select
                title="กรองตามพยาบาล"
                value={filterNurse}
                onChange={(e) => setFilterNurse(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              >
                <option value="">พยาบาลทั้งหมด</option>
                {nurseList.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <select
                title="กรองตามสถานะ"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | UrgentCallbackStatus)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="pending">รอดำเนินการ</option>
                <option value="in_progress">กำลังติดต่อ</option>
                <option value="done">ติดต่อสำเร็จ</option>
                <option value="cancelled">ยกเลิก</option>
              </select>
            </div>
            {(filterNurse || filterStatus !== 'all' || searchText) && (
              <button
                type="button"
                onClick={() => { setFilterNurse(''); setFilterStatus('all'); setSearchText(''); }}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                ล้างตัวกรอง
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              แสดง {filteredLog.length} รายการ
            </span>
          </div>

          {/* Detail table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs divide-y divide-slate-100">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-10">ครั้ง</th>
                    <th className="px-3 py-2.5 text-left">วันที่</th>
                    <th className="px-3 py-2.5 text-left">HN</th>
                    <th className="px-3 py-2.5 text-left">ชื่อผู้ป่วย</th>
                    <th className="px-3 py-2.5 text-left">เบอร์โทร</th>
                    <th className="px-3 py-2.5 text-left">วอร์ด / คลินิก</th>
                    <th className="px-3 py-2.5 text-left">สาเหตุการโทร</th>
                    <th className="px-3 py-2.5 text-left">พยาบาล</th>
                    <th className="px-3 py-2.5 text-left">สถานะ</th>
                    <th className="px-3 py-2.5 text-left">ผลลัพธ์ / หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLog.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center">
                        <ClipboardList className="mx-auto h-7 w-7 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-500">ไม่พบรายการที่ตรงกับตัวกรอง</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLog.map((req) => {
                      const sBadge = STATUS_BADGE[req.status];
                      const nurse  = nurseName(req);
                      const seq    = nurseSeqMap.get(req.id) ?? '—';
                      return (
                        <tr key={req.id} className={`hover:bg-indigo-50/20 transition ${req.status === 'done' ? 'opacity-80' : ''}`}>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-400">{seq}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTH(req.createdAt)}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">{req.hn || '—'}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[140px] truncate">{req.patientName}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-600">{req.phone || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600 max-w-[110px] truncate">{req.ward || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 max-w-[160px] truncate" title={req.reason}>
                            {req.reason || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 max-w-[120px] truncate font-medium">{nurse}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant={sBadge.variant} className="flex items-center gap-1 text-[10px] whitespace-nowrap w-fit">
                              {sBadge.icon}{STATUS_LABEL[req.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 max-w-[180px]">
                            <span className="block truncate" title={req.resolvedNote || req.note || ''}>
                              {req.resolvedNote || req.note || '—'}
                            </span>
                            {req.status === 'done' && (
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                {formatDateTimeTH(req.updatedAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
