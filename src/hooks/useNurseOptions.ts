// Fetch staff list from HOSxP `doctor` table for nurse assignment dropdown.

import { useEffect, useState } from 'react';
import { executeSqlViaApiQueued, APP_IDENTIFIER } from '@/services/bmsSession';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import type { ConnectionConfig } from '@/types';

export interface NurseOption {
  code: string;
  name: string;
}

const SQL = `
SELECT code, name
FROM doctor
WHERE active = 'Y' AND name IS NOT NULL AND name <> ''
ORDER BY name
LIMIT 500
`.trim();

export function useNurseOptions() {
  const { session } = useBmsSessionContext();
  const [options, setOptions] = useState<NurseOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);

    const config: ConnectionConfig = {
      apiUrl: session.apiUrl,
      bearerToken: session.bearerToken,
      databaseType: session.databaseType,
      appIdentifier: APP_IDENTIFIER,
    };

    executeSqlViaApiQueued(SQL, config, {})
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []) as Record<string, unknown>[];
        setOptions(
          rows
            .map((r) => ({
              code: String(r.code ?? ''),
              name: String(r.name ?? ''),
            }))
            .filter((o) => o.code && o.name),
        );
      })
      .catch(() => { /* silently degrade — dropdown still usable as free text */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [session]);

  return { options, loading };
}
