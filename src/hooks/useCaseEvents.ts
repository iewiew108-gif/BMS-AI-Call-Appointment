// =============================================================================
// useCaseEvents — subscribe to SSE events for a single AIDX case
//
// Drives the live transcript panel in AppointmentDetailDrawer.
// Only opens the SSE stream when caseId is non-null; closes and resets
// automatically when caseId changes or the component unmounts.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { subscribeCaseEvents, type CaseEvent } from '@/services/aidx';

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'closed' | 'error';

export interface UseCaseEventsResult {
  /** Accumulated transcript chunks in order received. */
  transcript: string[];
  /** Latest AI status string pushed by the SSE stream. */
  aiStatus: string | null;
  /** Raw events received (type + data). */
  events: CaseEvent[];
  connectionState: ConnectionState;
  error: Error | null;
}

export function useCaseEvents(caseId: string | null | undefined): UseCaseEventsResult {
  const [transcript, setTranscript] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Keep a stable ref to the unsubscribe fn so the cleanup can close the stream
  // even if the effect fires with the same caseId.
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Reset state whenever caseId changes (including to null).
    setTranscript([]);
    setAiStatus(null);
    setEvents([]);
    setError(null);

    if (!caseId) {
      setConnectionState('idle');
      return;
    }

    setConnectionState('connecting');

    const unsub = subscribeCaseEvents(caseId, {
      onStatus: (status) => {
        setAiStatus(status);
        setConnectionState('live');
      },
      onTranscript: (chunk) => {
        setTranscript((prev) => [...prev, chunk]);
        setConnectionState('live');
      },
      onEvent: (event) => {
        setEvents((prev) => [...prev, event]);
        setConnectionState('live');
      },
      onError: (err) => {
        setError(err);
        setConnectionState('error');
      },
      onClose: () => {
        setConnectionState('closed');
      },
    });

    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [caseId]);

  return { transcript, aiStatus, events, connectionState, error };
}
