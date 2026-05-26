// =============================================================================
// PostOpCallList — ติดตามผู้ป่วยหลังผ่าตัด
// ค้นหาจาก HOSxP (an_stat + iptoprt) บันทึกการโทรใน localStorage
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatedMedIcon } from '@/components/ui/AnimatedMedIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Scissors, PawPrint,
  Search, Phone, CheckCircle2, XCircle, PhoneOff, CalendarCheck,
  Clock, Loader2, AlertTriangle, User,
  Trash2, History, CalendarDays, CalendarPlus, CheckCheck, AlertCircle,
  Settings2, X, Plus, Pencil, Save, ExternalLink, BotMessageSquare,
  Flag, MessageSquare, ChevronDown, ChevronUp, ThumbsUp, AlertOctagon,
} from 'lucide-react';
import { usePostOpPatients } from '@/hooks/usePostOpPatients';
import { useNurseOptions } from '@/hooks/useNurseOptions';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import {
  getAllPostOpCallEntries,
  subscribePostOpCallLog,
  addPostOpCallEntry,
  deletePostOpCallEntry,
  getCallEntriesForAn,
  getLatestCallResultForAn,
} from '@/services/postOpCallLog';
import {
  getAllPostOpAiCallRecords,
  subscribePostOpAiCalls,
  getPostOpAiCallsForAn,
  getActiveAiCallForAn,
  getLatestAiCallForAn,
  createPostOpAiCallRecord,
  updatePostOpAiCallStatus,
  appendPostOpAiTranscript,
  deletePostOpAiCallRecord,
  setNurseFlag,
} from '@/services/postOpAiCalls';
import type { PostOpAiCallRecord, PostOpAiCallStatus, PostOpNurseFlag } from '@/services/postOpAiCalls';
import { enqueuePostOpCall, subscribeCaseEvents } from '@/services/aidx';
import {
  getTemplates,
  subscribeTemplates,
  getAllSchedules,
  subscribeSchedules,
  getSchedulesForAn,
  getNextDueSchedule,
  getOverdueSchedules,
  applyTemplateToPatients,
  addManualSchedule,
  completeSchedule,
  deleteSchedule,
  clearSchedulesForAn,
  saveTemplate,
  deleteTemplate,
} from '@/services/followUpSchedule';
import type { PostOpCallResult } from '@/types/postOpCall';
import type { PostOpFilter } from '@/hooks/usePostOpPatients';
import type { FollowUpTemplate } from '@/types/followUpSchedule';

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

const AI_STATUS_CONFIG: Record<PostOpAiCallStatus, {
  label: string; color: string; bg: string; border: string;
}> = {
  queued:    { label: 'รอโทร',          color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  calling:   { label: 'กำลังโทร',       color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  confirmed: { label: 'ยืนยันแล้ว',     color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
  no_answer: { label: 'ไม่รับสาย',      color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  escalated: { label: 'ส่งต่อพยาบาล',   color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  cancelled: { label: 'ยกเลิก',         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  error:     { label: 'เกิดข้อผิดพลาด', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  ended:     { label: 'สิ้นสุด',        color: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200'  },
};

const NURSE_FLAG_CONFIG: Record<PostOpNurseFlag, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode;
}> = {
  normal:         { label: 'ปกติ',             color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300',  icon: <ThumbsUp className="h-3 w-3" />        },
  abnormal:       { label: 'มีอาการผิดปกติ',  color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',    icon: <AlertOctagon className="h-3 w-3" />    },
  needs_followup: { label: 'ต้องติดตามเพิ่ม', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', icon: <Flag className="h-3 w-3" />            },
  booked_doctor:  { label: 'นัดพบแพทย์',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',   icon: <CalendarCheck className="h-3 w-3" />   },
};

// ---------------------------------------------------------------------------
// LiveCaptionBar — shows real-time current utterance during active call
// ---------------------------------------------------------------------------

interface LiveCaption {
  id: string;
  speaker: string;
  text: string;
}

function LiveCaptionBar({ caption }: { caption: LiveCaption | null }) {
  if (!caption) return null;
  const isAi = caption.speaker === 'AI' || /^ai$/i.test(caption.speaker);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-blue-900/30 bg-slate-900/90 px-3 py-2.5 shadow-md">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
        isAi ? 'bg-blue-500 text-white' : 'bg-green-600 text-white'
      }`}>
        {isAi ? '🤖 AI' : '🙋 ผู้ป่วย'}
      </span>
      <span className="flex-1 text-sm text-white/90 font-medium leading-snug">{caption.text}</span>
      <span className="flex gap-0.5 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TranscriptView — renders AI call transcript lines with speaker styling
// ---------------------------------------------------------------------------

function TranscriptView({ lines, maxHeight = 'max-h-48' }: { lines: string[]; maxHeight?: string }) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  if (lines.length === 0) return (
    <p className="text-[10px] text-slate-400 italic px-3 py-2">ยังไม่มีบทสนทนา</p>
  );

  return (
    <div className={`${maxHeight} overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-50 text-xs`}>
      {lines.map((line, i) => {
        const isAi      = /^AI:/i.test(line) || /^ผู้ช่วย:/i.test(line);
        const isPatient = /^ผู้ป่วย:/i.test(line) || /^patient:/i.test(line);
        const colonIdx  = line.indexOf(':');
        const speaker   = colonIdx > 0 && colonIdx < 15 ? line.slice(0, colonIdx) : null;
        const body      = speaker ? line.slice(colonIdx + 1).trim() : line;
        return (
          <div key={i} className={`px-3 py-1.5 ${isAi ? 'bg-blue-50/60' : isPatient ? 'bg-green-50/60' : ''}`}>
            {speaker && (
              <span className={`font-semibold mr-1 ${isAi ? 'text-blue-700' : isPatient ? 'text-green-700' : 'text-slate-500'}`}>
                {speaker}:
              </span>
            )}
            <span className="text-slate-700">{body}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

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
// Template Manager Modal
// ---------------------------------------------------------------------------

interface TemplateManagerModalProps {
  templates: import('@/types/followUpSchedule').FollowUpTemplate[];
  onClose: () => void;
}

function TemplateManagerModal({ templates, onClose }: TemplateManagerModalProps) {
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState('');
  const [editDays,  setEditDays]  = useState('');  // comma-separated
  const [newName,   setNewName]   = useState('');
  const [newDays,   setNewDays]   = useState('');

  const parseDays = (str: string): number[] =>
    str.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);

  const handleStartEdit = (t: import('@/types/followUpSchedule').FollowUpTemplate) => {
    setEditId(t.id);
    setEditName(t.name);
    setEditDays(t.days.join(', '));
  };

  const handleSaveEdit = () => {
    if (!editId || !editName.trim()) return;
    const days = parseDays(editDays);
    if (days.length === 0) return;
    saveTemplate({ id: editId, name: editName.trim(), days: days.sort((a, b) => a - b) });
    setEditId(null);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const days = parseDays(newDays);
    if (days.length === 0) return;
    const id = `tmpl_${Date.now()}`;
    saveTemplate({ id, name: newName.trim(), days: days.sort((a, b) => a - b) });
    setNewName('');
    setNewDays('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-indigo-50">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-indigo-800">จัดการ Template นัดติดตาม</h2>
          </div>
          <button type="button" title="ปิด" aria-label="ปิด" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Template list */}
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                {editId === t.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="ชื่อ Template"
                      className="w-full rounded border border-indigo-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <div>
                      <input
                        type="text"
                        value={editDays}
                        onChange={(e) => setEditDays(e.target.value)}
                        placeholder="วันที่ติดตาม เช่น 1, 3, 7, 14, 30"
                        className="w-full rounded border border-indigo-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <p className="mt-0.5 text-[10px] text-slate-400">ใส่จำนวนวันหลังผ่าตัด คั่นด้วยจุลภาค</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1 h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveEdit}>
                        <Save className="h-3 w-3" />บันทึก
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>ยกเลิก</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{t.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {t.days.map((d) => (
                          <span key={d} className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                            วัน {d}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(t)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition"
                        title="แก้ไข"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:text-red-500 hover:border-red-200 transition"
                        title="ลบ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add new template */}
          <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 space-y-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-indigo-700">
              <Plus className="h-3.5 w-3.5" />เพิ่ม Template ใหม่
            </p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ชื่อ Template เช่น หัตถการพิเศษ"
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-400"
            />
            <div>
              <input
                type="text"
                value={newDays}
                onChange={(e) => setNewDays(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="วันที่ติดตาม เช่น 1, 3, 7, 14, 30"
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-400"
              />
              <p className="mt-0.5 text-[10px] text-slate-400">จำนวนวันหลังผ่าตัด คั่นด้วยจุลภาค เช่น 1, 3, 7, 14, 30</p>
            </div>
            <Button
              size="sm"
              disabled={!newName.trim() || !newDays.trim()}
              onClick={handleAdd}
              className="gap-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />เพิ่ม Template
            </Button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs">ปิด</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PostOpCallList() {
  // Subscribe to stores for live updates
  useSyncExternalStore(subscribePostOpCallLog, getAllPostOpCallEntries);
  useSyncExternalStore(subscribeSchedules, getAllSchedules);
  useSyncExternalStore(subscribePostOpAiCalls, getAllPostOpAiCallRecords);
  const templates = useSyncExternalStore(subscribeTemplates, getTemplates);

  const { session } = useBmsSessionContext();
  const { options: nurseOptions } = useNurseOptions();

  // Filter state
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate,   setEndDate]   = useState(todayISO());
  const [doctorCode, setDoctorCode] = useState('');
  const [icd9Filter, setIcd9Filter] = useState('');
  const [activeFilter, setActiveFilter] = useState<PostOpFilter | null>(null);

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => templates[0]?.id ?? '');
  const selectedTemplate = useMemo<FollowUpTemplate | null>(
    () => templates.find((t) => t.id === selectedTemplateId) ?? templates[0] ?? null,
    [templates, selectedTemplateId],
  );

  // UI state
  const [expandedAn,  setExpandedAn]  = useState<string | null>(null); // call log form
  const [historyAn,   setHistoryAn]   = useState<string | null>(null); // history expand
  const [scheduleAn,  setScheduleAn]  = useState<string | null>(null); // schedule panel
  const [searchText,  setSearchText]  = useState('');
  const [manualDate,  setManualDate]  = useState(todayISO());
  const [manualLabel, setManualLabel] = useState('');
  const [completeBy,  setCompleteBy]  = useState('');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [aiPanelAn,    setAiPanelAn]    = useState<string | null>(null);
  const [aiCallLoading, setAiCallLoading] = useState<string | null>(null);
  const [aiCallError,  setAiCallError]  = useState<string | null>(null);
  const [transcriptExpandId, setTranscriptExpandId] = useState<string | null>(null);
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({});
  const [liveCaption, setLiveCaption] = useState<LiveCaption | null>(null);
  const sseUnsub = useRef<(() => void) | null>(null);

  const { rows, isLoading, error } = usePostOpPatients(activeFilter);

  const handleSearch = () => {
    setActiveFilter({ startDate, endDate, doctorCode: doctorCode || undefined, icd9Filter: icd9Filter || undefined });
    setExpandedAn(null);
    setHistoryAn(null);
    setScheduleAn(null);
  };

  const handleClear = () => {
    setDoctorCode('');
    setIcd9Filter('');
    setStartDate(daysAgoISO(30));
    setEndDate(todayISO());
    setActiveFilter(null);
    setExpandedAn(null);
    setHistoryAn(null);
    setScheduleAn(null);
    setSearchText('');
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplate || rows.length === 0) return;
    applyTemplateToPatients(
      rows.map((r) => ({ an: r.an, hn: r.hn, opDate: r.opDate })),
      selectedTemplate,
    );
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
    setScheduleAn(null);
  }, []);

  const handleToggleHistory = useCallback((an: string) => {
    setHistoryAn((prev) => prev === an ? null : an);
    setExpandedAn(null);
    setScheduleAn(null);
  }, []);

  const handleToggleSchedule = useCallback((an: string) => {
    setScheduleAn((prev) => prev === an ? null : an);
    setExpandedAn(null);
    setHistoryAn(null);
    setAiPanelAn(null);
    setManualDate(todayISO());
    setManualLabel('');
  }, []);

  const handleToggleAiPanel = useCallback((an: string) => {
    setAiPanelAn((prev) => prev === an ? null : an);
    setExpandedAn(null);
    setHistoryAn(null);
    setScheduleAn(null);
    setAiCallError(null);
  }, []);

  const handleStartAiCall = useCallback(async (
    an: string, hn: string, patientName: string,
    opDate: string, icd9Name: string | null, doctorName: string | null,
    contactPhone: string | null, cid: string | null,
  ) => {
    setAiCallLoading(an);
    setAiCallError(null);
    try {
      const result = await enqueuePostOpCall({
        an, hn, patientName, opDate,
        icd9Name,
        doctorName,
        contactPhone,
        cid: cid ?? undefined,
        hospcode: session?.userInfo?.hospitalCode ?? undefined,
      });
      const rec = createPostOpAiCallRecord(an, hn, patientName, result);
      const TERMINAL_STATUSES = new Set(['confirmed','no_answer','escalated','cancelled','error','ended']);
      // Subscribe to SSE for live status + transcript + live caption
      sseUnsub.current?.();
      sseUnsub.current = subscribeCaseEvents(result.caseId, {
        onStatus: (status) => {
          updatePostOpAiCallStatus(rec.id, status as PostOpAiCallStatus);
          if (TERMINAL_STATUSES.has(status)) setLiveCaption(null);
        },
        onTranscript: (chunk) => {
          appendPostOpAiTranscript(rec.id, chunk);
          setLiveCaption(null);
        },
        onCaption: (speaker, text) => setLiveCaption({ id: rec.id, speaker, text }),
        onError: () => {
          updatePostOpAiCallStatus(rec.id, 'error');
          setLiveCaption(null);
        },
        onClose: () => setLiveCaption(null),
      });
      // Open nurse observer URL in new tab if available
      if (result.joinUrl) window.open(result.joinUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setAiCallError(err instanceof Error ? err.message : 'ไม่สามารถเริ่มการโทรได้');
    } finally {
      setAiCallLoading(null);
    }
  }, []);

  // Re-subscribe to SSE when panel switches to a different AN that already has an active call
  useEffect(() => {
    if (!aiPanelAn) return;
    const active = getActiveAiCallForAn(aiPanelAn);
    if (!active) return;
    const TERMINAL_STATUSES = new Set(['confirmed','no_answer','escalated','cancelled','error','ended']);
    sseUnsub.current?.();
    sseUnsub.current = subscribeCaseEvents(active.caseId, {
      onStatus: (status) => {
        updatePostOpAiCallStatus(active.id, status as PostOpAiCallStatus);
        if (TERMINAL_STATUSES.has(status)) setLiveCaption(null);
      },
      onTranscript: (chunk) => {
        appendPostOpAiTranscript(active.id, chunk);
        setLiveCaption(null);
      },
      onCaption: (speaker, text) => setLiveCaption({ id: active.id, speaker, text }),
      onError: () => {
        updatePostOpAiCallStatus(active.id, 'error');
        setLiveCaption(null);
      },
      onClose: () => setLiveCaption(null),
    });
  }, [aiPanelAn]);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseUnsub.current?.(); }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
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
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">สรุปโทร</p>
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

          {/* Template selector */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">
                <CalendarDays className="h-3 w-3" />เทมเพลตติดตาม
              </p>
              <button
                type="button"
                title="จัดการ Template"
                aria-label="จัดการ Template"
                onClick={() => setShowTemplateManager(true)}
                className="rounded p-0.5 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <select
              title="เลือกเทมเพลต"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="flex flex-wrap gap-1">
                {selectedTemplate.days.map((d) => (
                  <span key={d} className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] text-indigo-700">
                    วัน {d}
                  </span>
                ))}
              </div>
            )}
            <Button
              size="sm"
              disabled={rows.length === 0 || !selectedTemplate}
              onClick={handleApplyTemplate}
              className="w-full h-7 text-[10px] gap-1 bg-indigo-600 hover:bg-indigo-700"
            >
              <CalendarPlus className="h-3 w-3" />
              ใช้กับผลลัพธ์ทั้งหมด
            </Button>
            <p className="text-[9px] text-slate-400 leading-tight">สร้างตารางนัดติดตามอัตโนมัติจากวันผ่าตัด (ข้ามรายที่มีอยู่แล้ว)</p>
          </div>
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
                        <th className="px-3 py-2.5 text-left">HN</th>
                        <th className="px-3 py-2.5 text-left">ชื่อผู้ป่วย</th>
                        <th className="px-3 py-2.5 text-left">เบอร์โทร</th>
                        <th className="px-3 py-2.5 text-left">การผ่าตัด (ICD-9)</th>
                        <th className="px-3 py-2.5 text-left">แพทย์</th>
                        <th className="px-3 py-2.5 text-left">นัดติดตาม</th>
                        <th className="px-3 py-2.5 text-left">สถานะโทร</th>
                        <th className="px-3 py-2.5 text-right"><span className="sr-only">จัดการ</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row, idx) => {
                        const latestResult = getLatestCallResultForAn(row.an);
                        const callCount    = getCallEntriesForAn(row.an).length;
                        const cfg          = latestResult ? CALL_RESULT_CONFIG[latestResult] : null;
                        const isFormOpen   = expandedAn  === row.an;
                        const isHistOpen   = historyAn   === row.an;
                        const isSchedOpen  = scheduleAn  === row.an;
                        const isAiOpen     = aiPanelAn   === row.an;
                        const phone        = bestPhone(row.homeTel, row.mobileTel, row.informTel);
                        const nextDue      = getNextDueSchedule(row.an);
                        const overdue      = getOverdueSchedules(row.an);
                        const schedCount   = getSchedulesForAn(row.an).length;
                        const today        = todayISO();
                        const activeAiCall = getActiveAiCallForAn(row.an);
                        const latestAiCall = getLatestAiCallForAn(row.an);
                        const aiCallHistory = getPostOpAiCallsForAn(row.an);
                        const isStartingAi  = aiCallLoading === row.an;

                        return (
                          <React.Fragment key={row.an}>
                            <tr className={`transition ${isFormOpen ? 'bg-green-50/40' : isSchedOpen ? 'bg-indigo-50/30' : isAiOpen ? 'bg-blue-50/30' : isHistOpen ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}>
                              <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTH(row.opDate)}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-500">{row.hn}</td>
                              <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[140px] truncate">{row.patientName}</td>
                              <td className="px-3 py-2.5">
                                <span className="flex items-center gap-1 font-mono text-slate-700">
                                  <Phone className="h-3 w-3 text-slate-400 shrink-0" />{phone}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 max-w-[160px]">
                                <span className="font-mono text-violet-600">{row.icd9Code}</span>
                                {row.icd9Name && (
                                  <span className="block text-slate-500 truncate" title={row.icd9Name}>{row.icd9Name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 max-w-[110px] truncate">{row.doctorName ?? '—'}</td>

                              {/* ── Schedule cell ── */}
                              <td className="px-3 py-2.5 min-w-[100px]">
                                {overdue.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-700 font-medium">
                                    <AlertCircle className="h-3 w-3" />เกิน {overdue.length} รายการ
                                  </span>
                                ) : nextDue ? (
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                    nextDue.dueDate === today
                                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                                      : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  }`}>
                                    <CalendarDays className="h-3 w-3" />
                                    วันที่ {nextDue.dayOffset > 0 ? nextDue.dayOffset : '?'}: {formatDateTH(nextDue.dueDate)}
                                  </span>
                                ) : schedCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] text-green-700">
                                    <CheckCheck className="h-3 w-3" />ครบแล้ว
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-300">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2.5 min-w-[120px]">
                                <div className="space-y-0.5">
                                  {latestAiCall ? (
                                    <>
                                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${AI_STATUS_CONFIG[latestAiCall.status].bg} ${AI_STATUS_CONFIG[latestAiCall.status].border} ${AI_STATUS_CONFIG[latestAiCall.status].color} ${latestAiCall.status === 'calling' ? 'animate-pulse' : ''}`}>
                                        <BotMessageSquare className="h-3 w-3" />{AI_STATUS_CONFIG[latestAiCall.status].label}
                                      </span>
                                      {latestAiCall.nurseFlag && (
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${NURSE_FLAG_CONFIG[latestAiCall.nurseFlag].bg} ${NURSE_FLAG_CONFIG[latestAiCall.nurseFlag].border} ${NURSE_FLAG_CONFIG[latestAiCall.nurseFlag].color}`}>
                                          {NURSE_FLAG_CONFIG[latestAiCall.nurseFlag].icon}{NURSE_FLAG_CONFIG[latestAiCall.nurseFlag].label}
                                        </span>
                                      )}
                                    </>
                                  ) : cfg ? (
                                    <Badge variant={cfg.variant} className="flex items-center gap-1 text-[10px] w-fit whitespace-nowrap">
                                      {cfg.icon}{cfg.label}
                                    </Badge>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                                      <Clock className="h-3 w-3" />ยังไม่โทร
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1 flex-nowrap">
                                  {/* AI Call button */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAiPanel(row.an)}
                                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition whitespace-nowrap ${
                                      isAiOpen
                                        ? 'border-blue-400 bg-blue-100 text-blue-700'
                                        : activeAiCall
                                        ? 'border-blue-400 bg-blue-50 text-blue-700 animate-pulse'
                                        : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    }`}
                                  >
                                    <BotMessageSquare className="h-3 w-3" />
                                    AI โทร{aiCallHistory.length > 0 ? ` (${aiCallHistory.length})` : ''}
                                  </button>
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
                                    {isFormOpen ? 'ปิด' : 'โทร'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSchedule(row.an)}
                                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition whitespace-nowrap ${
                                      isSchedOpen
                                        ? 'border-indigo-400 bg-indigo-100 text-indigo-700'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                    }`}
                                  >
                                    <CalendarDays className="h-3 w-3" />
                                    นัด{schedCount > 0 ? ` (${schedCount})` : ''}
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
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Inline AI call panel */}
                            {isAiOpen && (
                              <tr>
                                <td colSpan={10} className="bg-blue-50/40 border-t border-blue-100 p-0">
                                  <div className="px-4 py-3 space-y-3">
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1">
                                        <BotMessageSquare className="h-3.5 w-3.5" />AI โทรติดตามหลังผ่าตัด — {row.patientName}
                                      </p>
                                      {!activeAiCall && (
                                        <Button
                                          size="sm"
                                          disabled={isStartingAi}
                                          onClick={() => handleStartAiCall(
                                            row.an, row.hn, row.patientName,
                                            row.opDate, row.icd9Name, row.doctorName,
                                            bestPhone(row.homeTel, row.mobileTel, row.informTel),
                                            row.cid,
                                          )}
                                          className="gap-1.5 h-7 text-[10px] bg-blue-600 hover:bg-blue-700"
                                        >
                                          {isStartingAi
                                            ? <><Loader2 className="h-3 w-3 animate-spin" />กำลังเริ่ม...</>
                                            : <><BotMessageSquare className="h-3 w-3" />เริ่ม AI โทร</>
                                          }
                                        </Button>
                                      )}
                                    </div>

                                    {aiCallError && (
                                      <p className="flex items-center gap-1 text-xs text-red-600">
                                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />{aiCallError}
                                      </p>
                                    )}

                                    {/* Active call — status bar + live caption + transcript */}
                                    {activeAiCall && (
                                      <div className="space-y-2">
                                        {/* Status bar */}
                                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2">
                                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${AI_STATUS_CONFIG[activeAiCall.status].color}`}>
                                            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                            {AI_STATUS_CONFIG[activeAiCall.status].label}
                                          </span>
                                          {activeAiCall.joinUrl && (
                                            <a href={activeAiCall.joinUrl} target="_blank" rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 rounded border border-blue-400 bg-white px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-50 transition">
                                              <ExternalLink className="h-3 w-3" />เข้าร่วม (พยาบาล)
                                            </a>
                                          )}
                                          <Button size="sm" variant="destructive" className="h-6 gap-1 text-[10px] ml-auto"
                                            onClick={() => { updatePostOpAiCallStatus(activeAiCall.id, 'cancelled'); setLiveCaption(null); }}>
                                            <PhoneOff className="h-3 w-3" />ยกเลิก
                                          </Button>
                                        </div>

                                        {/* Live Caption */}
                                        {liveCaption?.id === activeAiCall.id && (
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                              Live Caption
                                            </p>
                                            <LiveCaptionBar caption={liveCaption} />
                                          </div>
                                        )}

                                        {/* Transcript */}
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />Transcript (สด)
                                          </p>
                                          <TranscriptView lines={activeAiCall.transcript} maxHeight="max-h-40" />
                                        </div>
                                      </div>
                                    )}

                                    {/* Call history */}
                                    {aiCallHistory.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                          ประวัติ AI โทร ({aiCallHistory.length})
                                        </p>
                                        {aiCallHistory
                                          .sort((a: PostOpAiCallRecord, b: PostOpAiCallRecord) => b.startedAt.localeCompare(a.startedAt))
                                          .map((rec: PostOpAiCallRecord) => {
                                            const sCfg = AI_STATUS_CONFIG[rec.status];
                                            const fCfg = rec.nurseFlag ? NURSE_FLAG_CONFIG[rec.nurseFlag] : null;
                                            const isEnded = !['queued','calling'].includes(rec.status);
                                            const transcriptOpen = transcriptExpandId === rec.id;
                                            const noteVal = flagNotes[rec.id] ?? rec.nurseFlagNote ?? '';
                                            return (
                                              <div key={rec.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                                {/* Card header */}
                                                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                                                  <BotMessageSquare className={`h-3 w-3 shrink-0 ${sCfg.color}`} />
                                                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                                    {new Date(rec.startedAt).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                  </span>
                                                  <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sCfg.bg} ${sCfg.border} ${sCfg.color}`}>
                                                    {sCfg.label}
                                                  </span>
                                                  {fCfg && (
                                                    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${fCfg.bg} ${fCfg.border} ${fCfg.color}`}>
                                                      {fCfg.icon}{fCfg.label}
                                                    </span>
                                                  )}
                                                  <div className="ml-auto flex items-center gap-1 shrink-0">
                                                    {rec.transcript.length > 0 && (
                                                      <button type="button"
                                                        onClick={() => setTranscriptExpandId(transcriptOpen ? null : rec.id)}
                                                        className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-blue-600 hover:border-blue-300 transition">
                                                        <MessageSquare className="h-3 w-3" />
                                                        บทสนทนา {rec.transcript.length} บรรทัด
                                                        {transcriptOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                      </button>
                                                    )}
                                                    {rec.joinUrl && (
                                                      <a href={rec.joinUrl} target="_blank" rel="noopener noreferrer"
                                                        className="text-slate-400 hover:text-blue-600 transition" title="เข้าร่วม">
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                      </a>
                                                    )}
                                                    <button type="button" onClick={() => deletePostOpAiCallRecord(rec.id)}
                                                      className="text-slate-300 hover:text-red-400 transition" title="ลบ">
                                                      <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* Transcript expand */}
                                                {transcriptOpen && (
                                                  <div className="px-3 pb-2 pt-1 border-t border-slate-100">
                                                    <TranscriptView lines={rec.transcript} maxHeight="max-h-56" />
                                                  </div>
                                                )}

                                                {/* Nurse flag section — shown when call has ended */}
                                                {isEnded && (
                                                  <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 space-y-2">
                                                    <p className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                                                      <Flag className="h-3 w-3 text-slate-400" />ประเมินผลการโทร
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                      {(Object.keys(NURSE_FLAG_CONFIG) as PostOpNurseFlag[]).map((f) => {
                                                        const fc = NURSE_FLAG_CONFIG[f];
                                                        const selected = rec.nurseFlag === f;
                                                        return (
                                                          <button key={f} type="button"
                                                            onClick={() => setNurseFlag(rec.id, selected ? null : f, noteVal || undefined)}
                                                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition ${
                                                              selected
                                                                ? `${fc.bg} ${fc.border} ${fc.color} shadow-sm`
                                                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                                            }`}
                                                          >
                                                            {fc.icon}{fc.label}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                    <div className="flex gap-2 items-center">
                                                      <input
                                                        type="text"
                                                        placeholder="บันทึกเพิ่มเติม..."
                                                        value={noteVal}
                                                        onChange={(e) => setFlagNotes((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                                                        className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder:text-slate-400"
                                                      />
                                                      {noteVal !== (rec.nurseFlagNote ?? '') && (
                                                        <Button size="sm" className="h-7 text-[10px] gap-1 bg-blue-600 hover:bg-blue-700"
                                                          onClick={() => {
                                                            setNurseFlag(rec.id, rec.nurseFlag ?? null, noteVal);
                                                            setFlagNotes((prev) => { const n = { ...prev }; delete n[rec.id]; return n; });
                                                          }}>
                                                          <Save className="h-3 w-3" />บันทึก
                                                        </Button>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}

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

                            {/* Inline schedule panel */}
                            {isSchedOpen && (
                              <tr>
                                <td colSpan={10} className="bg-indigo-50/40 border-t border-indigo-100 p-0">
                                  <div className="px-4 py-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                                        <CalendarDays className="h-3.5 w-3.5" />ตารางนัดติดตาม — {row.patientName}
                                      </p>
                                      {schedCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => clearSchedulesForAn(row.an)}
                                          className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-0.5"
                                        >
                                          <Trash2 className="h-3 w-3" />ล้างทั้งหมด
                                        </button>
                                      )}
                                    </div>

                                    {/* Schedule list */}
                                    {getSchedulesForAn(row.an).length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">ยังไม่มีตารางนัด — ใช้ปุ่ม "ใช้กับผลลัพธ์ทั้งหมด" หรือเพิ่ม Manual ด้านล่าง</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {getSchedulesForAn(row.an)
                                          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                                          .map((s) => (
                                            <div key={s.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 ${
                                              s.completedAt
                                                ? 'bg-green-50 border-green-200'
                                                : s.dueDate < today
                                                ? 'bg-red-50 border-red-200'
                                                : s.dueDate === today
                                                ? 'bg-amber-50 border-amber-200'
                                                : 'bg-white border-slate-200'
                                            }`}>
                                              <div className="flex items-center gap-2 min-w-0">
                                                {s.completedAt ? (
                                                  <CheckCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                                ) : s.dueDate < today ? (
                                                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                ) : (
                                                  <CalendarDays className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                                )}
                                                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                                                  {s.dayOffset > 0 ? `วันที่ ${s.dayOffset}` : s.label ?? 'Manual'}
                                                </span>
                                                <span className="text-xs text-slate-500">{formatDateTH(s.dueDate)}</span>
                                                {s.completedAt && (
                                                  <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                                                    <User className="h-3 w-3" />{s.completedBy ?? ''}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1 shrink-0">
                                                {!s.completedAt && (
                                                  <button
                                                    type="button"
                                                    onClick={() => completeSchedule(s.id, completeBy || 'พยาบาล')}
                                                    className="inline-flex items-center gap-0.5 rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700 hover:bg-green-100 transition"
                                                  >
                                                    <CheckCircle2 className="h-3 w-3" />ติดต่อแล้ว
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => deleteSchedule(s.id)}
                                                  className="text-slate-300 hover:text-red-400 transition"
                                                  title="ลบ"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    )}

                                    {/* Add manual */}
                                    <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-indigo-100">
                                      <div className="space-y-0.5">
                                        <label className="block text-[10px] text-slate-500">วันที่ (Manual)</label>
                                        <input
                                          type="date"
                                          title="วันนัดติดตาม"
                                          aria-label="วันนัดติดตาม"
                                          value={manualDate}
                                          onChange={(e) => setManualDate(e.target.value)}
                                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                        />
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="block text-[10px] text-slate-500">หมายเหตุ</label>
                                        <input
                                          type="text"
                                          placeholder="เช่น ตรวจแผล..."
                                          value={manualLabel}
                                          onChange={(e) => setManualLabel(e.target.value)}
                                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-slate-400"
                                        />
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="block text-[10px] text-slate-500">ผู้บันทึก</label>
                                        <select
                                          title="ผู้บันทึก"
                                          value={completeBy}
                                          onChange={(e) => setCompleteBy(e.target.value)}
                                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                        >
                                          <option value="">— เลือก —</option>
                                          {nurseOptions.map((n) => (
                                            <option key={n.code} value={n.name}>{n.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <Button
                                        size="sm"
                                        className="h-7 gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => {
                                          addManualSchedule(row.an, row.hn, manualDate, manualLabel || undefined);
                                          setManualLabel('');
                                        }}
                                      >
                                        <CalendarPlus className="h-3 w-3" />เพิ่ม
                                      </Button>
                                    </div>
                                  </div>
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

    {showTemplateManager && (
      <TemplateManagerModal
        templates={templates}
        onClose={() => setShowTemplateManager(false)}
      />
    )}
    </>
  );
}
