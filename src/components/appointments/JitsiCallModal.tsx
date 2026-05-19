// =============================================================================
// JitsiCallModal — embedded Jitsi video-call + live caption overlay
//
// Layout:
//   ┌─ top bar: patient info · caption toggle · copy patient URL · hang up ─┐
//   │                                                                         │
//   │  ┌─ Jitsi iframe (nurse view) ──────────────────┐  ┌─ transcript ──┐  │
//   │  │                                               │  │  (when open)  │  │
//   │  │                                               │  │               │  │
//   │  │  [caption overlay at bottom of iframe]        │  │               │  │
//   │  └───────────────────────────────────────────────┘  └───────────────┘  │
//   │                                                                         │
//   └─ bottom bar: patient URL + copy ───────────────────────────────────────┘
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  X, Copy, Check, ExternalLink, Video,
  Captions, CaptionsOff, PanelRightOpen, PanelRightClose,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCaseEvents, type ConnectionState } from '@/hooks/useCaseEvents';
import { cn } from '@/lib/utils';

export interface JitsiCallSession {
  /** Jitsi URL for the nurse to join. */
  nurseUrl: string;
  /** Jitsi URL to share with the patient. */
  patientUrl?: string;
  /** AI session reference id (oapp-{oappId}). */
  caseId: string;
  patientName: string;
  hn: string;
}

interface JitsiCallModalProps {
  session: JitsiCallSession | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Connection state helpers
// ---------------------------------------------------------------------------

const STATE_DOT: Record<ConnectionState, string> = {
  idle: 'bg-slate-500',
  connecting: 'bg-amber-400 animate-pulse',
  live: 'bg-emerald-500 animate-pulse',
  closed: 'bg-slate-500',
  error: 'bg-rose-500',
};

const STATE_LABEL: Record<ConnectionState, string> = {
  idle: 'รอ',
  connecting: 'กำลังเชื่อมต่อ…',
  live: 'LIVE',
  closed: 'สิ้นสุด',
  error: 'ผิดพลาด',
};

// ---------------------------------------------------------------------------
// JitsiCallModal
// ---------------------------------------------------------------------------

export function JitsiCallModal({ session, onClose }: JitsiCallModalProps) {
  const [copied, setCopied] = useState(false);
  const [showCaption, setShowCaption] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const panelEndRef = useRef<HTMLDivElement>(null);

  const { transcript, aiStatus, connectionState } = useCaseEvents(session?.caseId);

  // Auto-scroll caption overlay and transcript panel
  useEffect(() => {
    captionRef.current?.scrollIntoView({ behavior: 'smooth' });
    panelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Close on Escape
  useEffect(() => {
    if (!session) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [session, onClose]);

  if (!session) return null;

  const handleCopy = async () => {
    if (!session.patientUrl) return;
    try {
      await navigator.clipboard.writeText(session.patientUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard not available */
    }
  };

  // Last 3 transcript lines for the caption overlay
  const captionLines = transcript.slice(-3);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-2.5">

        {/* Left: patient + SSE status */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <Video className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              วีดีโอโทร — {session.patientName}
            </p>
            <p className="text-xs text-slate-400">HN {session.hn} · Case {session.caseId}</p>
          </div>
          {/* SSE connection dot */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className={cn('h-2 w-2 rounded-full', STATE_DOT[connectionState])} />
            <span className="text-xs text-slate-400">
              {aiStatus ? `AI: ${aiStatus}` : STATE_LABEL[connectionState]}
            </span>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5">
          {/* Caption toggle */}
          <button
            type="button"
            title={showCaption ? 'ซ่อน Caption' : 'แสดง Caption'}
            onClick={() => setShowCaption((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
              showCaption
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
            )}
          >
            {showCaption ? (
              <Captions className="h-3.5 w-3.5" />
            ) : (
              <CaptionsOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Live Caption</span>
          </button>

          {/* Transcript panel toggle */}
          <button
            type="button"
            title={showPanel ? 'ซ่อน Transcript' : 'แสดง Transcript ทั้งหมด'}
            onClick={() => setShowPanel((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
              showPanel
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
            )}
          >
            {showPanel ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Transcript</span>
          </button>

          {/* Patient URL buttons */}
          {session.patientUrl && (
            <>
              <button
                type="button"
                onClick={() => void handleCopy()}
                title="คัดลอก URL ผู้ป่วย"
                className="flex items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{copied ? 'คัดลอกแล้ว!' : 'URL ผู้ป่วย'}</span>
              </button>
              <a
                href={session.patientUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-600 sm:flex"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                เปิด
              </a>
            </>
          )}

          <Button size="sm" variant="destructive" onClick={onClose} className="gap-1.5">
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">วางสาย</span>
          </Button>
        </div>
      </div>

      {/* ── Main area: Jitsi + optional transcript panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Jitsi iframe */}
        <div className="relative flex-1 bg-slate-950">
          <iframe
            ref={iframeRef}
            src={session.nurseUrl}
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
            className="h-full w-full border-0"
            title={`วีดีโอโทร ${session.patientName}`}
          />

          {/* ── Live Caption overlay ── */}
          {showCaption && captionLines.length > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-4 pb-4"
              aria-live="polite"
              aria-label="Live Caption"
            >
              {captionLines.map((line, i) => (
                <span
                  key={i}
                  ref={i === captionLines.length - 1 ? captionRef : undefined}
                  className={cn(
                    'max-w-3xl rounded-md px-4 py-1.5 text-center text-sm font-medium leading-snug shadow-lg',
                    'bg-black/75 text-white backdrop-blur-sm',
                    i < captionLines.length - 1 && 'opacity-60 text-xs',
                  )}
                >
                  {line}
                </span>
              ))}
            </div>
          )}

          {/* Caption "no signal" hint when toggled on but no data yet */}
          {showCaption && captionLines.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-slate-400 backdrop-blur-sm">
                {connectionState === 'idle' || connectionState === 'connecting'
                  ? '⏳ รอ Caption…'
                  : connectionState === 'error'
                  ? '⚠ SSE error — Caption ไม่พร้อมใช้'
                  : 'ยังไม่มี Caption'}
              </span>
            </div>
          )}
        </div>

        {/* ── Transcript side panel ── */}
        {showPanel && (
          <div className="flex w-72 shrink-0 flex-col border-l border-slate-700 bg-slate-800 xl:w-80">
            <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', STATE_DOT[connectionState])} />
                <p className="text-xs font-semibold text-slate-200">
                  Transcript — {STATE_LABEL[connectionState]}
                </p>
              </div>
              <span className="text-[10px] text-slate-500">{transcript.length} บรรทัด</span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {transcript.length === 0 ? (
                <p className="text-xs italic text-slate-500">
                  {connectionState === 'connecting' ? 'กำลังรอข้อความ…' : 'ยังไม่มีข้อความ'}
                </p>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className="rounded-md bg-slate-700/60 px-3 py-2">
                    <p className="text-sm leading-relaxed text-slate-100">{line}</p>
                  </div>
                ))
              )}
              <div ref={panelEndRef} />
            </div>

            {aiStatus && (
              <div className="border-t border-slate-700 px-3 py-2">
                <p className="text-[11px] text-slate-400">
                  สถานะ AI: <span className="font-medium text-slate-200">{aiStatus}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom bar: patient URL ── */}
      {session.patientUrl && (
        <div className="border-t border-slate-700 bg-slate-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-400">ลิงก์ผู้ป่วย:</span>
            <span className="flex-1 truncate rounded bg-slate-700 px-2 py-1 font-mono text-[11px] text-slate-300">
              {session.patientUrl}
            </span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex shrink-0 items-center gap-1 rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'แล้ว' : 'คัดลอก'}
            </button>
            <a
              href={session.patientUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
            >
              <ExternalLink className="h-3 w-3" />
              เปิด
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
