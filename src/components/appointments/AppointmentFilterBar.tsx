// =============================================================================
// AppointmentFilterBar — date range + clinic / doctor / HN search + quick chips
// =============================================================================

import { useCallback, useState } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateISO } from '@/utils/dateUtils';
import type { AppointmentFilter, CallStatus } from '@/types/appointment';

function todayIso(): string {
  return formatDateISO(new Date());
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateISO(d);
}

function daysAheadIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

interface QuickRangeChip {
  label: string;
  start: () => string;
  end: () => string;
}

const QUICK_RANGES: QuickRangeChip[] = [
  { label: 'วันนี้',     start: todayIso,     end: todayIso },
  { label: 'พรุ่งนี้',    start: tomorrowIso,  end: tomorrowIso },
  { label: '7 วัน',      start: todayIso,     end: () => daysAheadIso(6) },
  { label: '30 วัน',     start: todayIso,     end: () => daysAheadIso(29) },
];

interface CallStatusChip {
  label: string;
  value: CallStatus | null;
  activeClass: string;
}

const CALL_STATUS_CHIPS: CallStatusChip[] = [
  { label: 'ทั้งหมด',     value: null,              activeClass: 'border-slate-900 bg-slate-900 text-white' },
  { label: 'รอโทร',       value: 'pending',         activeClass: 'border-amber-600 bg-amber-500 text-white' },
  { label: 'อยู่ในคิว',   value: 'queued',          activeClass: 'border-sky-600 bg-sky-500 text-white' },
  { label: 'กำลังโทร',   value: 'calling',         activeClass: 'border-blue-600 bg-blue-500 text-white' },
  { label: 'ยืนยัน',      value: 'confirmed',       activeClass: 'border-emerald-600 bg-emerald-500 text-white' },
  { label: 'เลื่อนนัด',   value: 'rescheduled',     activeClass: 'border-orange-600 bg-orange-500 text-white' },
  { label: 'ยกเลิก',      value: 'cancelled',       activeClass: 'border-red-600 bg-red-500 text-white' },
  { label: 'ไม่รับสาย',   value: 'no_answer',       activeClass: 'border-slate-500 bg-slate-500 text-white' },
  { label: 'Escalate',    value: 'escalated',       activeClass: 'border-rose-600 bg-rose-500 text-white' },
  { label: 'มาแล้ว',      value: 'already_visited', activeClass: 'border-teal-600 bg-teal-500 text-white' },
];

interface AppointmentFilterBarProps {
  filter: AppointmentFilter;
  setFilter: (next: Partial<AppointmentFilter>) => void;
  resetFilter: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function AppointmentFilterBar({
  filter,
  setFilter,
  resetFilter,
  onRefresh,
  isLoading,
}: AppointmentFilterBarProps) {
  // Mirror HN locally so typing is responsive — apply only on Enter / blur.
  const [hnDraft, setHnDraft] = useState<string>(filter.hn ?? '');

  const applyHn = useCallback(() => {
    const trimmed = hnDraft.trim();
    setFilter({ hn: trimmed.length === 0 ? null : trimmed });
  }, [hnDraft, setFilter]);

  const handleQuick = (chip: QuickRangeChip) => {
    setFilter({ startDate: chip.start(), endDate: chip.end() });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Filter className="h-4 w-4" />
        ตัวกรองรายการนัด
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
        {/* Date range */}
        <div className="md:col-span-3">
          <label className="text-xs text-slate-600">วันที่นัด — จาก</label>
          <Input
            type="date"
            value={filter.startDate}
            onChange={(e) => setFilter({ startDate: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-slate-600">ถึง</label>
          <Input
            type="date"
            value={filter.endDate}
            onChange={(e) => setFilter({ endDate: e.target.value })}
            className="mt-1"
          />
        </div>

        {/* Clinic + Doctor + ผู้นัด */}
        <div className="md:col-span-2">
          <label className="text-xs text-slate-600">คลินิก (รหัส)</label>
          <Input
            placeholder="ทั้งหมด"
            value={filter.clinic ?? ''}
            onChange={(e) =>
              setFilter({ clinic: e.target.value.trim() === '' ? null : e.target.value })
            }
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-600">แพทย์ผู้นัด (รหัส)</label>
          <Input
            placeholder="ทั้งหมด"
            value={filter.doctor ?? ''}
            onChange={(e) =>
              setFilter({ doctor: e.target.value.trim() === '' ? null : e.target.value })
            }
            className="mt-1"
          />
        </div>

        {/* HN search */}
        <div className="md:col-span-2">
          <label className="text-xs text-slate-600">ค้นหา HN</label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              placeholder="HN"
              value={hnDraft}
              onChange={(e) => setHnDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyHn();
              }}
              onBlur={applyHn}
            />
            <Button size="icon" variant="outline" onClick={applyHn} aria-label="ค้นหา HN">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick date chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600">ช่วงวัน:</span>
        {QUICK_RANGES.map((c) => {
          const active = filter.startDate === c.start() && filter.endDate === c.end();
          return (
            <button
              type="button"
              key={c.label}
              onClick={() => handleQuick(c)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Call status chips */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600">สถานะโทร:</span>
        {CALL_STATUS_CHIPS.map((c) => {
          const active = (filter.callStatus ?? null) === c.value;
          return (
            <button
              type="button"
              key={c.label}
              onClick={() => setFilter({ callStatus: c.value })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                active
                  ? c.activeClass
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Toggles + actions */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(filter.excludeAlreadyVisited)}
            onChange={(e) => setFilter({ excludeAlreadyVisited: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          ซ่อนคนไข้ที่มาแล้ว
        </label>
        <Input
          placeholder="ผู้นัด (login)"
          value={filter.appUser ?? ''}
          onChange={(e) =>
            setFilter({ appUser: e.target.value.trim() === '' ? null : e.target.value })
          }
          className="h-7 w-32 text-xs"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={resetFilter}
            disabled={isLoading}
          >
            รีเซ็ต
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            รีเฟรช
          </Button>
        </div>
      </div>
    </div>
  );
}
