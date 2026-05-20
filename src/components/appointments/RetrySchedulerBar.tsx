// =============================================================================
// RetrySchedulerBar — แถบแสดงสถานะการโทรซ้ำอัตโนมัติทุก 30 นาที
// =============================================================================

import { RefreshCw, Clock, BellOff, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScheduledRetry } from '@/services/retryScheduler';

interface RetrySchedulerBarProps {
  scheduledRetries: ScheduledRetry[];
  enabled: boolean;
  onSetEnabled: (v: boolean) => void;
  countdown: string;
}

export function RetrySchedulerBar({
  scheduledRetries,
  enabled,
  onSetEnabled,
  countdown,
}: RetrySchedulerBarProps) {
  if (scheduledRetries.length === 0 && !enabled) return null;

  const count = scheduledRetries.length;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm shadow-sm transition-colors ${
        enabled && count > 0
          ? 'border-amber-200 bg-amber-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <RefreshCw
          className={`h-4 w-4 ${enabled && count > 0 ? 'animate-spin text-amber-600' : 'text-slate-400'}`}
          style={{ animationDuration: '3s' }}
        />
        <span className={enabled && count > 0 ? 'text-amber-800 font-medium' : 'text-slate-500'}>
          โทรซ้ำอัตโนมัติ
        </span>

        {count > 0 && enabled && (
          <>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {count} รายการ
            </span>
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <Clock className="h-3 w-3" />
              ครั้งถัดไปใน {countdown} น.
            </span>
          </>
        )}

        {count === 0 && enabled && (
          <span className="text-xs text-slate-400">ไม่มีรายการรอโทรซ้ำ</span>
        )}

        {!enabled && (
          <span className="text-xs text-slate-400">ปิดใช้งาน</span>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className={`gap-1.5 text-xs ${enabled ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : ''}`}
        onClick={() => onSetEnabled(!enabled)}
      >
        {enabled ? (
          <>
            <BellOff className="h-3.5 w-3.5" />
            ปิดโทรซ้ำ
          </>
        ) : (
          <>
            <Bell className="h-3.5 w-3.5" />
            เปิดโทรซ้ำ
          </>
        )}
      </Button>
    </div>
  );
}
