// =============================================================================
// EscalatedAlertPanel — Floating popup แจ้งเตือนพยาบาลกรณี escalate
//
// แสดงด้านขวาของหน้าจอ สูงสุด 5 เคส
// Auto-dismiss หลัง 5 วินาที พร้อม countdown bar
// Re-trigger ทุกครั้งที่จำนวน escalated เพิ่มขึ้น
// =============================================================================

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Phone, Calendar, X, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { getAllCallAttempts, subscribeCallAttempts } from '@/services/callAttempts';
import { useAppointments, type EnrichedAppointment } from '@/hooks/useAppointments';
import { formatDateISO } from '@/utils/dateUtils';
import { getAppSettings, subscribeAppSettings } from '@/services/appSettings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDateRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 14);
  const end = new Date(today);
  end.setDate(today.getDate() + 30);
  return { startDate: formatDateISO(start), endDate: formatDateISO(end) };
}

function getBestPhone(appt: EnrichedAppointment): string {
  return appt.mobilePhone ?? appt.homePhone ?? appt.informPhone ?? '';
}

function formatApptDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
  });
}

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'เมื่อกี้';
  if (min < 60) return `${min} นาที`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.`;
  return `${Math.floor(hr / 24)} วัน`;
}

// ---------------------------------------------------------------------------
// Inner popup — renders when data is ready; auto-dismisses after dismissMs
// ---------------------------------------------------------------------------

interface PopupProps {
  rows: EnrichedAppointment[];
  dismissMs: number;
  onClose: () => void;
}

function EscalatedPopup({ rows, dismissMs, onClose }: PopupProps) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(100); // 100 → 0 over dismissMs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const step = 100 / (dismissMs / 50); // update every 50 ms
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p - step;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          onClose();
          return 0;
        }
        return next;
      });
    }, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onClose, dismissMs]);

  const top5 = rows.slice(0, 5);

  return (
    <div className="escalated-panel">
      {/* Header */}
      <div className="ep-header">
        <div className="ep-header-left">
          <AlertTriangle className="ep-icon" />
          <span className="ep-title">เคส Escalate รอพยาบาล</span>
          <span className="ep-badge">{top5.length}</span>
        </div>
        <button type="button" className="ep-close" onClick={onClose} aria-label="ปิด">
          <X size={14} />
        </button>
      </div>

      {/* Countdown progress bar */}
      <div className="ep-progress-track">
        <div className="ep-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Patient cards */}
      <div className="ep-list">
        {top5.map((appt) => {
          const phone = getBestPhone(appt);
          const escalatedAt = appt.callAttempt?.updatedAt;
          return (
            <div key={appt.oappId} className="ep-card">
              <div className="ep-card-row">
                <span className="ep-patient-name">{appt.patientName}</span>
                <span className="ep-hn">HN {appt.hn}</span>
              </div>
              {phone && (
                <div className="ep-card-row ep-detail">
                  <Phone size={11} className="ep-detail-icon" />
                  <span>{phone}</span>
                </div>
              )}
              <div className="ep-card-row ep-detail">
                <Calendar size={11} className="ep-detail-icon" />
                <span>
                  นัด {formatApptDate(appt.nextDate)}
                  {appt.clinicName && ` · ${appt.clinicName}`}
                </span>
                {escalatedAt && (
                  <span className="ep-elapsed">
                    <Clock size={10} />
                    {elapsedLabel(escalatedAt)}
                  </span>
                )}
              </div>
              {appt.callAttempt?.reason && (
                <p className="ep-reason">{appt.callAttempt.reason}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer link */}
      <button
        type="button"
        className="ep-footer"
        onClick={() => {
          onClose();
          navigate('/urgent-callback');
        }}
      >
        <span>ไปหน้าแจ้งพยาบาลด่วน</span>
        <ArrowRight size={13} />
      </button>

      <style>{`
        .escalated-panel {
          position: fixed;
          top: 76px;
          right: 16px;
          z-index: 60;
          width: 320px;
          background: white;
          border-radius: 12px;
          border: 1.5px solid #fbbf24;
          box-shadow: 0 8px 32px -4px rgba(0,0,0,0.18), 0 0 0 1px rgba(251,191,36,0.15);
          overflow: hidden;
          animation: epSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes epSlideIn {
          from { opacity: 0; transform: translateX(32px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0)  scale(1); }
        }

        .ep-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px 8px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-bottom: 1px solid #fbbf24;
        }

        .ep-header-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ep-icon {
          width: 15px;
          height: 15px;
          color: #d97706;
          flex-shrink: 0;
        }

        .ep-title {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #92400e;
          line-height: 1;
        }

        .ep-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          background: #ef4444;
          color: white;
          border-radius: 999px;
          font-size: 0.625rem;
          font-weight: 700;
          animation: epBadgePulse 2s ease-in-out infinite;
        }

        @keyframes epBadgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }

        .ep-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          background: rgba(0,0,0,0.06);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          color: #78350f;
          transition: background 0.15s;
        }

        .ep-close:hover {
          background: rgba(0,0,0,0.12);
        }

        /* Progress bar */
        .ep-progress-track {
          height: 3px;
          background: #fde68a;
        }

        .ep-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          transition: width 0.05s linear;
        }

        /* Patient list */
        .ep-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: 340px;
          overflow-y: auto;
        }

        .ep-card {
          padding: 8px 12px;
          border-bottom: 1px solid #fef3c7;
        }

        .ep-card:last-child {
          border-bottom: none;
        }

        .ep-card-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 2px;
        }

        .ep-patient-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #1e293b;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ep-hn {
          font-size: 0.6875rem;
          color: #64748b;
          font-family: monospace;
          flex-shrink: 0;
        }

        .ep-detail {
          font-size: 0.75rem;
          color: #475569;
        }

        .ep-detail-icon {
          color: #94a3b8;
          flex-shrink: 0;
          position: relative;
          top: 1px;
        }

        .ep-elapsed {
          display: flex;
          align-items: center;
          gap: 2px;
          margin-left: auto;
          font-size: 0.6875rem;
          color: #f59e0b;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .ep-reason {
          margin-top: 2px;
          font-size: 0.6875rem;
          color: #92400e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Footer */
        .ep-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          padding: 8px 12px;
          background: #fef3c7;
          border: none;
          border-top: 1px solid #fbbf24;
          font-size: 0.75rem;
          font-weight: 500;
          color: #92400e;
          cursor: pointer;
          transition: background 0.15s;
        }

        .ep-footer:hover {
          background: #fde68a;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Middle layer — loads HOSxP data; manages show/re-trigger logic
// ---------------------------------------------------------------------------

interface LoaderProps {
  escalatedCount: number;
}

function EscalatedPanelLoader({ escalatedCount }: LoaderProps) {
  const settings = useSyncExternalStore(subscribeAppSettings, getAppSettings);
  const dismissMs = settings.escalatedPopupDurationSec * 1000;

  const dateRange = useMemo(() => buildDateRange(), []);
  const { rows, isLoading } = useAppointments({
    ...dateRange,
    callStatus: 'escalated',
    limit: 200,
  });

  // Track previous count to detect increases → re-show popup
  const prevCountRef = useRef(0);
  // showKey changes → popup remounts with fresh 5 s timer
  const [showKey, setShowKey] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = escalatedCount;

    if (escalatedCount > prev) {
      // New escalated cases → trigger popup
      setShowKey((k) => (k ?? 0) + 1);
      setVisible(true);
    }
  }, [escalatedCount]);

  // Initial mount: show if there are already escalated cases when data loads
  const hasShownInitial = useRef(false);
  useEffect(() => {
    if (!isLoading && rows.length > 0 && !hasShownInitial.current) {
      hasShownInitial.current = true;
      setShowKey(1);
      setVisible(true);
    }
  }, [isLoading, rows.length]);

  const handleClose = () => setVisible(false);

  if (!visible || showKey === null) return null;

  if (isLoading) {
    return (
      <div className="ep-loading-badge">
        <Loader2 size={13} className="ep-spin" />
        <span>กำลังโหลดเคส Escalate...</span>
        <style>{`
          .ep-loading-badge {
            position: fixed;
            top: 76px;
            right: 16px;
            z-index: 60;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: #fef3c7;
            border: 1.5px solid #fbbf24;
            border-radius: 99px;
            font-size: 0.75rem;
            color: #92400e;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .ep-spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (rows.length === 0) return null;

  return <EscalatedPopup key={showKey} rows={rows} dismissMs={dismissMs} onClose={handleClose} />;
}

// ---------------------------------------------------------------------------
// Outer entry point — subscribe to callAttempts store
// ---------------------------------------------------------------------------

export function EscalatedAlertPanel() {
  const allAttempts = useSyncExternalStore(subscribeCallAttempts, getAllCallAttempts);
  const escalatedCount = useMemo(
    () => allAttempts.filter((a) => a.status === 'escalated').length,
    [allAttempts],
  );

  if (escalatedCount === 0) return null;
  return <EscalatedPanelLoader escalatedCount={escalatedCount} />;
}
