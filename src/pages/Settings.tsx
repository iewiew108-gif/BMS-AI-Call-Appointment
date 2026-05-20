// =============================================================================
// Settings Page — ตั้งค่าระบบ
// =============================================================================

import { useSyncExternalStore, useCallback, useState } from 'react';
import { Bell, RotateCcw, Check, Stethoscope, Bird } from 'lucide-react';
import { AnimatedMedIcon } from '@/components/ui/AnimatedMedIcon';
import { Button } from '@/components/ui/button';
import {
  getAppSettings,
  updateAppSettings,
  resetAppSettings,
  subscribeAppSettings,
  SETTINGS_CONSTRAINTS,
  SETTINGS_DEFAULTS,
} from '@/services/appSettings';

// ---------------------------------------------------------------------------
// DurationSlider — slider + stepper + live preview label
// ---------------------------------------------------------------------------

interface DurationSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function DurationSlider({ value, min, max, onChange }: DurationSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="ds-wrap">
      {/* Track + thumb */}
      <div className="ds-track-wrap">
        <div
          className="ds-fill"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ds-input"
          aria-label="ระยะเวลาแสดง popup"
        />
      </div>

      {/* Stepper buttons + value display */}
      <div className="ds-controls">
        <button
          type="button"
          className="ds-btn"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="ลดลง 1 วินาที"
        >
          −
        </button>
        <span className="ds-value">{value} <span className="ds-unit">วินาที</span></span>
        <button
          type="button"
          className="ds-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="เพิ่ม 1 วินาที"
        >
          +
        </button>
      </div>

      {/* Tick marks */}
      <div className="ds-ticks">
        {[min, Math.round((min + max) / 2), max].map((t) => (
          <span
            key={t}
            className={`ds-tick ${value === t ? 'ds-tick-active' : ''}`}
            style={{ left: `${((t - min) / (max - min)) * 100}%` }}
          >
            {t}s
          </span>
        ))}
      </div>

      <style>{`
        .ds-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
          user-select: none;
        }

        .ds-track-wrap {
          position: relative;
          height: 6px;
          background: #e2e8f0;
          border-radius: 999px;
          margin: 8px 0 0;
        }

        .ds-fill {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          border-radius: 999px;
          pointer-events: none;
          transition: width 0.1s;
        }

        .ds-input {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          margin: 0;
          z-index: 1;
        }

        /* Custom thumb via the fill pseudo — show a circle at fill end */
        .ds-track-wrap::after {
          content: '';
          position: absolute;
          top: 50%;
          left: calc(var(--fill-pct, 50%) - 10px);
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          background: white;
          border: 2.5px solid #6366f1;
          border-radius: 50%;
          box-shadow: 0 1px 6px rgba(99,102,241,0.3);
          pointer-events: none;
          transition: left 0.1s;
        }

        .ds-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .ds-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1.5px solid #cbd5e1;
          background: white;
          font-size: 1.25rem;
          line-height: 1;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ds-btn:hover:not(:disabled) {
          border-color: #6366f1;
          color: #6366f1;
          background: #eef2ff;
        }

        .ds-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .ds-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          min-width: 5ch;
          text-align: center;
          line-height: 1;
        }

        .ds-unit {
          font-size: 0.75rem;
          font-weight: 400;
          color: #94a3b8;
        }

        .ds-ticks {
          position: relative;
          height: 16px;
          margin-top: -4px;
        }

        .ds-tick {
          position: absolute;
          transform: translateX(-50%);
          font-size: 0.6875rem;
          color: #94a3b8;
        }

        .ds-tick-active {
          color: #6366f1;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PopupPreview — แสดงตัวอย่าง popup จำลอง
// ---------------------------------------------------------------------------

function PopupPreview({ durationSec }: { durationSec: number }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(100);

  const handleDemo = useCallback(() => {
    setRunning(true);
    setProgress(100);
    const ms = durationSec * 1000;
    const step = 100 / (ms / 50);
    const iv = setInterval(() => {
      setProgress((p) => {
        const next = p - step;
        if (next <= 0) {
          clearInterval(iv);
          setRunning(false);
          return 0;
        }
        return next;
      });
    }, 50);
  }, [durationSec]);

  return (
    <div className="preview-wrap">
      <div className="preview-popup">
        <div className="preview-header">
          <Bell size={13} className="preview-icon" />
          <span className="preview-title">เคส Escalate รอพยาบาล</span>
          <span className="preview-badge">3</span>
        </div>
        <div className="preview-progress-track">
          <div
            className="preview-progress-bar"
            style={{
              width: running ? `${progress}%` : '100%',
              transition: running ? 'width 0.05s linear' : 'none',
            }}
          />
        </div>
        <div className="preview-body">
          <p className="preview-item">● นาย สมชาย ใจดี — HN 00123</p>
          <p className="preview-item">● นาง มาลี รักดี — HN 00456</p>
          <p className="preview-item preview-more">+1 เคส...</p>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="preview-demo-btn"
        onClick={handleDemo}
        disabled={running}
      >
        {running ? `กำลังนับ ${durationSec} วินาที...` : 'ทดสอบ Demo'}
      </Button>

      <style>{`
        .preview-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }

        .preview-popup {
          width: 280px;
          background: white;
          border-radius: 10px;
          border: 1.5px solid #fbbf24;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
          overflow: hidden;
          pointer-events: none;
        }

        .preview-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border-bottom: 1px solid #fbbf24;
        }

        .preview-icon { color: #d97706; flex-shrink: 0; }

        .preview-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: #92400e;
          flex: 1;
        }

        .preview-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          font-size: 0.6rem;
          font-weight: 700;
        }

        .preview-progress-track {
          height: 3px;
          background: #fde68a;
        }

        .preview-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #f59e0b, #ef4444);
        }

        .preview-body {
          padding: 8px 10px;
        }

        .preview-item {
          font-size: 0.75rem;
          color: #334155;
          margin-bottom: 3px;
        }

        .preview-more {
          color: #94a3b8;
          font-size: 0.6875rem;
        }

        .preview-demo-btn {
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Settings() {
  const settings = useSyncExternalStore(subscribeAppSettings, getAppSettings);
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((durationSec: number) => {
    updateAppSettings({ escalatedPopupDurationSec: durationSec });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const handleReset = useCallback(() => {
    resetAppSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const { min, max } = SETTINGS_CONSTRAINTS.escalatedPopupDurationSec;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-2 pb-12 sm:px-4">
      {/* Page header */}
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AnimatedMedIcon
              hospitalIcon={Stethoscope}
              vetIcon={Bird}
              animation="spin-slow"
              color="text-slate-500"
              size="sm"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">ตั้งค่า</h1>
          </div>

          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium animate-in fade-in">
                <Check className="h-3.5 w-3.5" />
                บันทึกแล้ว
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-slate-500 text-xs"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              รีเซ็ตค่าเริ่มต้น
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-500">ปรับแต่งการทำงานของระบบแจ้งเตือน</p>
      </header>

      {/* Section: การแจ้งเตือน */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <Bell className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-700">การแจ้งเตือน Popup</h2>
        </div>

        <div className="px-5 py-6 space-y-8">
          {/* Setting row */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-10">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-slate-800">ระยะเวลาแสดง Popup</h3>
                <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                  กำหนดเวลาที่ popup เคส Escalate จะแสดงบนหน้าจอก่อน auto-dismiss
                  ช่วงที่เลือกได้: {min}–{max} วินาที (ค่าเริ่มต้น: {SETTINGS_DEFAULTS.escalatedPopupDurationSec} วินาที)
                </p>
              </div>

              <DurationSlider
                value={settings.escalatedPopupDurationSec}
                min={min}
                max={max}
                onChange={handleChange}
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-800">ตัวอย่าง</h3>
              <p className="text-xs text-slate-500">กด "ทดสอบ Demo" เพื่อดูความเร็ว countdown bar</p>
              <PopupPreview durationSec={settings.escalatedPopupDurationSec} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
