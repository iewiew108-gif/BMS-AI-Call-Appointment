// =============================================================================
// useFilterOptions — fetches distinct clinic and doctor options for the
// filter-bar dropdowns, keyed on the active date range.
// =============================================================================

import { useEffect, useState } from 'react';
import { useMemo } from 'react';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { fetchClinicOptions, fetchDoctorOptions, type FilterOption } from '@/services/operationAppointments';
import { APP_IDENTIFIER } from '@/services/bmsSession';
import type { ConnectionConfig } from '@/types';

function configFromSession(session: ReturnType<typeof useBmsSessionContext>['session']): ConnectionConfig | null {
  if (!session) return null;
  return {
    apiUrl: session.apiUrl,
    bearerToken: session.bearerToken,
    databaseType: session.databaseType,
    appIdentifier: APP_IDENTIFIER,
  };
}

export interface FilterOptions {
  clinicOptions: FilterOption[];
  doctorOptions: FilterOption[];
  isLoading: boolean;
}

export function useFilterOptions(startDate: string, endDate: string): FilterOptions {
  const { session } = useBmsSessionContext();
  const config = useMemo(() => configFromSession(session), [session]);

  const [clinicOptions, setClinicOptions] = useState<FilterOption[]>([]);
  const [doctorOptions, setDoctorOptions] = useState<FilterOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!config || !startDate || !endDate) return;

    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      fetchClinicOptions(startDate, endDate, config),
      fetchDoctorOptions(startDate, endDate, config),
    ])
      .then(([clinics, doctors]) => {
        if (!cancelled) {
          setClinicOptions(clinics);
          setDoctorOptions(doctors);
        }
      })
      .catch(() => {
        // silently degrade — filter bar still works as text input
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [config, startDate, endDate]);

  return { clinicOptions, doctorOptions, isLoading };
}
