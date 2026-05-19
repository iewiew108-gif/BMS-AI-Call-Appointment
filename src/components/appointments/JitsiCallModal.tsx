// =============================================================================
// JitsiCallModal — embedded Jitsi video-call window for the nurse
//
// Shows the nurse-side Jitsi URL in a full-screen overlay iframe so the nurse
// can see and speak with the patient (via the AI bot relay or directly).
// The patient's Jitsi URL is shown as a copyable link — the nurse can send it
// via LINE / WhatsApp when the patient hasn't received a หมอพร้อม invite yet.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, ExternalLink, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

export function JitsiCallModal({ session, onClose }: JitsiCallModalProps) {
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      // clipboard not available — silently ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20">
            <Video className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              วีดีโอโทร — {session.patientName}
            </p>
            <p className="text-xs text-slate-400">HN {session.hn} · Case {session.caseId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.patientUrl && (
            <>
              <a
                href={session.patientUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-600 sm:flex"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                เปิดลิงก์ผู้ป่วย
              </a>
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
                {copied ? 'คัดลอกแล้ว!' : 'คัดลอก URL ผู้ป่วย'}
              </button>
            </>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={onClose}
            className="gap-1.5"
          >
            <X className="h-4 w-4" />
            วางสาย / ปิด
          </Button>
        </div>
      </div>

      {/* Jitsi iframe — fills remaining space */}
      <div className="relative flex-1 bg-slate-950">
        <iframe
          ref={iframeRef}
          src={session.nurseUrl}
          allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
          className="h-full w-full border-0"
          title={`วีดีโอโทร ${session.patientName}`}
        />
      </div>

      {/* Bottom bar — patient URL */}
      {session.patientUrl && (
        <div className="border-t border-slate-700 bg-slate-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-400">ลิงก์สำหรับผู้ป่วย:</span>
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
