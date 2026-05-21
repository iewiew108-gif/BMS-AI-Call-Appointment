// =============================================================================
// PostOpCallList — ติดตามผู้ป่วยหลังผ่าตัด
// ค้นหาจาก HOSxP (an_stat + iptoprt) บันทึกการโทรใน localStorage
// =============================================================================

import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatedMedIcon } from '@/components/ui/AnimatedMedIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Scissors, PawPrint,
  Search, Phone, CheckCircle2, XCircle, PhoneOff, CalendarCheck,
  Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp, User,
  Trash2, History,
} from 'lucide-react';
import { usePostOpPatients } from '@/hooks/usePostOpPatients';
import { useNurseOptions } from '@/hooks/useNurseOptions';
import {
  getAllPostOpCallEntries,
  subscribePostOpCallLog,
  addPostOpCallEntry,
  deletePostOpCallEntry,
  getCallEntriesForAn,
  getLatestCallResultForAn,
} from '@/services/postOpCallLog';
import type { PostOpCallResult } from '@/types/postOpCall';
import type { PostOpFilter } from '@/hooks/usePostOpPatients';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDateTH(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatDateTimeTH(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function bestPhone(homeTel: string | null, mobileTel: string | null, informTel: string | null): string {
  return mobileTel || homeTel || informTel || '—';
}

const CALL_RESULT_CONFIG: Record<PostOpCallResult, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  answered:         { label: 'ติดต่อได้',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  icon: <CheckCircle2 className="h-3 w-3" />, variant: 'secondary'   },
  no_answer:        { label: 'ไม่รับสาย',        color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: <PhoneOff className="h-3 w-3" />,     variant: 'default'     },
  refused:          { label: 'ปฏิเสธ',           color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: <XCircle className="h-3 w-3" />,      variant: 'destructive' },
  appointment_made: { label: 'นัดหมายแล้ว',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: <CalendarCheck className="h-3 w-3" />, variant: 'default'    },
};

// ---------------------------------------------------------------------------
// Inline call log form (expanded under a row)
// ---------------------------------------------------------------------------

interface CallLogFormProps {
  an: string;
  hn: string;
  patientName: string;
  nurseOptions: { code: string; name: string }[];
  onClose: () => void;
}

function CallLogForm({ an, hn, patientName, nurseOptions, onClose }: CallLogFormProps) {
  const [result, setResult] = useState<PostOpCallResult>('answered');
  const [note, setNote] = useState('');
  const [calledBy, setCalledBy] = useState('');

  const handleSave = () => {
    addPostOpCallEntry(an, hn, result, note, calledBy);
    onClose();
  };

  return (
    <div className="bg-green-50 border-t border-green-200 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-green-800">
        บันทึกการโทร — {patientName}
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CALL_RESULT_CONFIG) as PostOpCallResult[]).map((r) => {
          const cfg = CALL_RESULT_CONFIG[r];
          return (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                result === r
                  ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm`
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              {cfg.icon}{cfg.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-600">
            <User className="inline h-3 w-3 mr-0.5" />ผู้โทร (พยาบาล)
          </label>
          <select
            title="เลือกพยาบาลผู้โทร"
            value={calledBy}
            onChange={(e) => setCalledBy(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">— ระบุผู้โทร —</option>
            {nurseOptions.map((n) => (
              <option key={n.code} value={n.name}>{n.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-600">หมายเหตุ / ผลการติดต่อ</label>
          <Input
            placeholder="สรุปผลการสนทนา..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs h-8"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" onClick={handleSave}>
          <CheckCircle2 className="h-3.5 w-3.5" />บันทึก
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={onClose}>ยกเลิก</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PostOpCallList() {
  // Subscribe to call log store for live updates
  useSyncExternalStore(subscribePostOpCallLog, getAllPostOpCallEntries);

  const { options: nurseOptions } = useNurseOptions();

  // Filter state
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate,   setEndDate]   = useState(todayISO());
  const [doctorCode, setDoctorCode] = useState('');
  const [icd9Filter, setIcd9Filter] = useState('');
  const [activeFilter, setActiveFilter] = useState<PostOpFilter | null>(null);

  // UI state
  const [expandedAn, setExpandedAn]   = useState<string | null>(null); // call log form
  const [historyAn,  setHistoryAn]    = useState<string | null>(null); // history expand
  const [searchText, setSearchText]   = useState('');

  const { rows, isLoading, error } = usePostOpPatients(activeFilter);

  const handleSearch = () => {
    setActiveFilter({ startDate, endDate, doctorCode: doctorCode || undefined, icd9Filter: icd9Filter || undefined });
    setExpandedAn(null);
    setHistoryAn(null);
  };

  const handleClear = () => {
    setDoctorCode('');
    setIcd9Filter('');
    setStartDate(daysAgoISO(30));
    setEndDate(todayISO());
    setActiveFilter(null);
    setExpandedAn(null);
    setHistoryAn(null);
    setSearchText('');
  };

  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return rows;
    const q = searchText.toLowerCase();
    return rows.filter((r) =>
      r.patientName.toLowerCase().includes(q) ||
      r.hn.toLowerCase().includes(q) ||
      r.an.toLowerCase().includes(q) ||
      (r.mobileTel ?? '').includes(q) ||
      (r.homeTel ?? '').includes(q) ||
      (r.icd9Code ?? '').includes(q) ||
      (r.icd9Name ?? '').toLowerCase().includes(q) ||
      (r.doctorName ?? '').toLowerCase().includes(q)
    );
  }, [rows, searchText]);

  // KPI
  const kpi = useMemo(() => {
    const total = rows.length;
    let called = 0, answered = 0, noAnswer = 0, refused = 0, appointmentMade = 0;
    for (const r of rows) {
      const latest = getLatestCallResultForAn(r.an);
      if (latest) {
        called++;
        if (latest === 'answered')         answered++;
        if (latest === 'no_answer')        noAnswer++;
        if (latest === 'refused')          refused++;
        if (latest === 'appointment_made') appointmentMade++;
      }
    }
    return { total, called, notCalled: total - called, answered, noAnswer, refused, appointmentMade };
  }, [rows]);

  const handleToggleCallForm = useCallback((an: string) => {
    setExpandedAn((prev) => prev === an ? null : an);
    setHistoryAn(null);
  }, []);

  const handleToggleHistory = useCallback((an: string) => {
    setHistoryAn((prev) => prev === an ? null : an);
    setExpandedAn(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-0 pb-12">

      {/* ── Left Filter Sidebar ───────────────────────────────────── */}
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col gap-0 overflow-y-auto">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AnimatedMedIcon hospitalIcon={Scissors} vetIcon={PawPrint} animation="float" color="text-violet-500" size="sm" className="shrink-0" />
            <span className="text-xs font-bold text-slate-700">ติดตามหลังผ่าตัด</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">ค้นหาและบันทึกการโทรติดตาม</p>
        </div>

        {/* Filter fields */}
        <div className="px-3 py-3 space-y-3 flex-1">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 uppercase tracking-wide">
            <Search className="h-3 w-3" />ตัวกรอง
          </p>

          {/* Date from */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-slate-500">วันผ่าตัด (ตั้งแต่)</label>
            <input
              type="date"
              title="วันที่ผ่าตัด ตั้งแต่"
              aria-label="วันที่ผ่าตัด ตั้งแต่"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>

          {/* Date to */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-slate-500">วันผ่าตัด (ถึง)</label>
            <input
              type="date"
              title="วันที่ผ่าตัด ถึง"
              aria-label="วันที่ผ่าตัด ถึง"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>

          {/* ICD-9 */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-slate-500">ICD-9 / ชื่อการผ่าตัด</label>
            <input
              type="text"
              placeholder="เช่น 8154, knee, TKA..."
              value={icd9Filter}
              onChange={(e) => setIcd9Filter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300 placeholder:text-slate-400"
            />
          </div>

          {/* Doctor code */}
          <div className="space-y-1">
            <label className="block text-[10px] font-medium text-slate-500">รหัสแพทย์</label>
            <input
              type="text"
              placeholder="เช่น D001, ว001..."
              value={doctorCode}
              onChange={(e) => setDoctorCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300 placeholder:text-slate-400"
            />
          </div>

          {/* Buttons */}
          <div className="space-y-1.5 pt-1">
            <Button onClick={handleSearch} disabled={isLoading} className="w-full gap-1.5 h-8 text-xs bg-violet-600 hover:bg-violet-700">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              ค้นหา
            </Button>
            <Button variant="ghost" onClick={handleClear} className="w-full h-7 text-xs text-slate-400 hover:text-slate-600">
              ล้างค่า
            </Button>
          </div>

          {/* KPI mini */}
          {rows.length > 0 && (
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">สรุป</p>
              {([
                { label: 'พบทั้งหมด',    value: kpi.total,           color: 'text-violet-700' },
                { label: 'ยังไม่โทร',    value: kpi.notCalled,       color: 'text-slate-500'  },
                { label: 'โทรแล้ว',     value: kpi.called,          color: 'text-indigo-600' },
                { label: 'ติดต่อได้',   value: kpi.answered,        color: 'text-green-600'  },
                { label: 'ไม่รับสาย',   value: kpi.noAnswer,        color: 'text-orange-600' },
                { label: 'นัดหมายแล้ว', value: kpi.appointmentMade, color: 'text-blue-600'   },
              ] as const).map((k) => (
                <div key={k.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">{k.label}</span>
                  <span className={`text-xs font-bold ${k.color}`}>{k.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right Content ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 space-y-3">

        {/* Page title */}
        <div>
          <h1 className="text-lg font-semibold text-slate-900">โทรติดตามผู้ป่วยหลังผ่าตัด</h1>
          <p className="text-xs text-slate-500">ค้นหาตามช่วงวันผ่าตัด · แพทย์ผู้ผ่าตัด · รหัส/ชื่อการผ่าตัด</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {activeFilter ? (
          <div className="space-y-2">
            {/* Search within results */}
            {rows.length > 0 && (
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="กรองในผลลัพธ์ (ชื่อ / HN / AN / ICD-9)..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-200 focus:border-violet-300"
                />
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">
                  รายชื่อผู้ป่วยหลังผ่าตัด
                  {rows.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                      {filteredRows.length}
                    </span>
                  )}
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                  กำลังดึงข้อมูลจาก HOSxP...
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">ไม่พบข้อมูลผู้ป่วย</p>
                  <p className="text-xs text-slate-400 mt-1">ลองปรับช่วงวันที่หรือเงื่อนไขการค้นหา</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs divide-y divide-slate-100">
                    <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 text-center w-8">#</th>
                        <th className="px-3 py-2.5 text-left">วันผ่าตัด</th>
                        <th className="px-3 py-2.5 text-left">AN</th>
                        <th className="px-3 py-2.5 text-left">HN</th>
                        <th className="px-3 py-2.5 text-left">ชื่อผู้ป่วย</th>
                        <th className="px-3 py-2.5 text-left">เบอร์โทร</th>
                        <th className="px-3 py-2.5 text-left">การผ่าตัด (ICD-9)</th>
                        <th className="px-3 py-2.5 text-left">แพทย์ผู้ผ่าตัด</th>
                        <th className="px-3 py-2.5 text-left">สถานะโทร</th>
                        <th className="px-3 py-2.5 text-right"><span className="sr-only">จัดการ</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row, idx) => {
                        const latestResult = getLatestCallResultForAn(row.an);
                        const callCount    = getCallEntriesForAn(row.an).length;
                        const cfg          = latestResult ? CALL_RESULT_CONFIG[latestResult] : null;
                        const isFormOpen   = expandedAn === row.an;
                        const isHistOpen   = historyAn  === row.an;
                        const phone        = bestPhone(row.homeTel, row.mobileTel, row.informTel);

                        return (
                          <React.Fragment key={row.an}>
                            <tr className={`transition ${isFormOpen ? 'bg-green-50/40' : isHistOpen ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}>
                              <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTH(row.opDate)}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-500 text-[10px]">{row.an}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-500">{row.hn}</td>
                              <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[150px] truncate">{row.patientName}</td>
                              <td className="px-3 py-2.5">
                                <span className="flex items-center gap-1 font-mono text-slate-700">
                                  <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                  {phone}
                                </span>
                                {row.homeTel && row.mobileTel && (
                                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">บ้าน: {row.homeTel}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 max-w-[180px]">
                                <span className="font-mono text-violet-600">{row.icd9Code}</span>
                                {row.icd9Name && (
                                  <span className="block text-slate-500 truncate" title={row.icd9Name}>{row.icd9Name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 max-w-[120px] truncate">{row.doctorName ?? '—'}</td>
                              <td className="px-3 py-2.5">
                                {cfg ? (
                                  <div className="space-y-0.5">
                                    <Badge variant={cfg.variant} className="flex items-center gap-1 text-[10px] w-fit whitespace-nowrap">
                                      {cfg.icon}{cfg.label}
                                    </Badge>
                                    {callCount > 1 && (
                                      <span className="text-[10px] text-slate-400">{callCount} ครั้ง</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                                    <Clock className="h-3 w-3" />ยังไม่โทร
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1 flex-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCallForm(row.an)}
                                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition whitespace-nowrap ${
                                      isFormOpen
                                        ? 'border-green-400 bg-green-100 text-green-700'
                                        : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                                    }`}
                                  >
                                    <Phone className="h-3 w-3" />
                                    {isFormOpen ? 'ปิด' : 'บันทึกโทร'}
                                  </button>
                                  {callCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleHistory(row.an)}
                                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition whitespace-nowrap ${
                                        isHistOpen
                                          ? 'border-blue-400 bg-blue-100 text-blue-700'
                                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                                      }`}
                                    >
                                      <History className="h-3 w-3" />
                                      {callCount}
                                      {isHistOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Inline call log form */}
                            {isFormOpen && (
                              <tr>
                                <td colSpan={10} className="p-0">
                                  <CallLogForm
                                    an={row.an}
                                    hn={row.hn}
                                    patientName={row.patientName}
                                    nurseOptions={nurseOptions}
                                    onClose={() => setExpandedAn(null)}
                                  />
                                </td>
                              </tr>
                            )}

                            {/* Inline call history */}
                            {isHistOpen && (
                              <tr>
                                <td colSpan={10} className="bg-blue-50/30 border-t border-blue-100 p-0">
                                  <div className="px-4 py-3 space-y-2">
                                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">ประวัติการโทร</p>
                                    {getCallEntriesForAn(row.an).map((entry) => {
                                      const eCfg = CALL_RESULT_CONFIG[entry.callResult];
                                      return (
                                        <div key={entry.id} className={`flex items-start justify-between gap-3 rounded-lg border ${eCfg.border} ${eCfg.bg} px-3 py-2`}>
                                          <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${eCfg.color}`}>
                                              {eCfg.icon}{eCfg.label}
                                            </span>
                                            {entry.note && <span className="text-xs text-slate-600">— {entry.note}</span>}
                                            {entry.calledBy && (
                                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                                <User className="h-3 w-3" />{entry.calledBy}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTimeTH(entry.callDate)}</span>
                                            <button
                                              type="button"
                                              onClick={() => deletePostOpCallEntry(entry.id)}
                                              className="text-slate-300 hover:text-red-400 transition"
                                              title="ลบรายการ"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : !isLoading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
            <Scissors className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-500">กรอกเงื่อนไขแล้วกด "ค้นหา"</p>
            <p className="text-xs text-slate-400 mt-1">ระบุช่วงวันผ่าตัด และตัวกรองที่ต้องการ</p>
          </div>
        ) : null}

      </div>
    </div>
  );
}
