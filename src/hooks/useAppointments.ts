// =============================================================================
// useAppointments — appointment list + call-attempt state hook
//
// Glues the data layer (HOSxP query) and the local call-attempt store into a
// single React-friendly shape:
//
//   - filter state with sensible defaults (tomorrow + One Day Case only)
//   - query lifecycle via the shared `useQuery` hook
//   - real-time merge of `callAttempts` updates (no re-fetch needed when a
//     row's call status flips)
//   - derived KPI tile values for the dashboard header
// =============================================================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type {
  Appointment,
  AppointmentFilter,
  AppointmentKpis,
  CallAttempt,
  CallStatus,
} from '@/types/appointment';
import { listOneDayCaseAppointments } from '@/services/operationAppointments';
import {
  getAllCallAttempts,
  subscribeCallAttempts,
} from '@/services/callAttempts';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { useQuery } from '@/hooks/useQuery';
import { formatDateISO } from '@/utils/dateUtils';
import { APP_IDENTIFIER } from '@/services/bmsSession';
import type { ConnectionConfig, Session } from '@/types';

// ---------------------------------------------------------------------------
// Filter defaults — tomorrow's One Day Cases
// ---------------------------------------------------------------------------

function todayIso(): string {
  return formatDateISO(new Date());
}

/** A row enriched with the latest call-attempt status. */
export interface EnrichedAppointment extends Appointment {
  callStatus: CallStatus;
  callAttempt: CallAttempt | undefined;
}

export interface UseAppointmentsResult {
  filter: AppointmentFilter;
  setFilter: (next: Partial<AppointmentFilter>) => void;
  resetFilter: () => void;
  rows: EnrichedAppointment[];
  kpis: AppointmentKpis;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  executionTimeMs: number | null;
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: ReadonlySet<CallStatus> = new Set<CallStatus>([
  'confirmed',
  'rescheduled',
  'cancelled',
  'no_answer',
  'escalated',
  'already_visited',
]);

function deriveCallStatus(
  appointment: Appointment,
  attempt: CallAttempt | undefined,
): CallStatus {
  if (appointment.visitCount > 0) return 'already_visited';
  return attempt?.status ?? 'pending';
}

function computeKpis(rows: EnrichedAppointment[]): AppointmentKpis {
  let confirmed = 0;
  let attempted = 0;
  let escalated = 0;
  for (const r of rows) {
    if (r.callStatus === 'confirmed') confirmed += 1;
    if (r.callStatus === 'escalated') escalated += 1;
    if (TERMINAL_STATUSES.has(r.callStatus)) attempted += 1;
  }
  return { total: rows.length, confirmed, attempted, escalated };
}

// ---------------------------------------------------------------------------
// External-store subscription — keep useSyncExternalStore happy
// ---------------------------------------------------------------------------

function subscribeStore(onChange: () => void): () => void {
  return subscribeCallAttempts(onChange);
}

function snapshotStore(): CallAttempt[] {
  return getAllCallAttempts();
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

function configFromSession(session: Session | null): ConnectionConfig | null {
  if (!session) return null;
  return {
    apiUrl: session.apiUrl,
    bearerToken: session.bearerToken,
    databaseType: session.databaseType,
    appIdentifier: APP_IDENTIFIER,
  };
}

export function useAppointments(initialFilter?: Partial<AppointmentFilter>): UseAppointmentsResult {
  const { session } = useBmsSessionContext();
  const config = useMemo(() => configFromSession(session), [session]);

  const defaultFilter = useMemo<AppointmentFilter>(() => {
    const today = todayIso();
    return {
      startDate: today,
      endDate: today,
      clinic: null,
      doctor: null,
      appUser: null,
      hn: null,
      excludeAlreadyVisited: false,
      callStatus: null,
      limit: 200,
      ...initialFilter,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filter, setFilterState] = useState<AppointmentFilter>(defaultFilter);

  const queryFn = useCallback(async (): Promise<Appointment[]> => {
    if (!config) return [];
    return listOneDayCaseAppointments(filter, config);
  }, [config, filter]);

  const { data, state, error, executionTimeMs, execute } = useQuery<Appointment[]>({
    queryFn,
    enabled: Boolean(config),
  });

  // Re-run the query when the filter changes (and we have a session).
  useEffect(() => {
    if (config) void execute();
  }, [filter, config, execute]);

  // Subscribe to the call-attempt store so a status flip re-renders without a
  // round-trip to HOSxP.
  const attempts = useSyncExternalStore(subscribeStore, snapshotStore, snapshotStore);

  const rows = useMemo<EnrichedAppointment[]>(() => {
    const byId = new Map<number, CallAttempt>();
    for (const a of attempts) byId.set(a.oappId, a);

    const enriched = (data ?? []).map((appointment) => {
      const attempt = byId.get(appointment.oappId);
      return {
        ...appointment,
        callAttempt: attempt,
        callStatus: deriveCallStatus(appointment, attempt),
      };
    });

    if (filter.callStatus) {
      return enriched.filter((r) => r.callStatus === filter.callStatus);
    }
    return enriched;
  }, [data, attempts, filter.callStatus]);

  const kpis = useMemo(() => computeKpis(rows), [rows]);

  const setFilter = useCallback((next: Partial<AppointmentFilter>) => {
    setFilterState((current) => ({ ...current, ...next }));
  }, []);

  const resetFilter = useCallback(() => {
    setFilterState(defaultFilter);
  }, [defaultFilter]);

  const refetch = useCallback(async () => {
    await execute();
  }, [execute]);

  return {
    filter,
    setFilter,
    resetFilter,
    rows,
    kpis,
    isLoading: state === 'loading',
    isError: state === 'error',
    error,
    executionTimeMs,
    refetch,
  };
}
