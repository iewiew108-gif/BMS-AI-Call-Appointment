// Query HOSxP for post-op patients via an_stat + iptoprt + icd9cm1 + patient + doctor

import { useEffect, useState } from 'react';
import { executeSqlViaApiQueued, APP_IDENTIFIER } from '@/services/bmsSession';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import type { ConnectionConfig, SqlParams } from '@/types';
import type { PostOpPatientRow } from '@/types/postOpCall';

export interface PostOpFilter {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  doctorCode?: string; // FK doctor.code
  icd9Filter?: string; // code OR partial name
}

function asStr(v: unknown): string { return v != null ? String(v) : ''; }
function asNullStr(v: unknown): string | null {
  const s = asStr(v); return s === '' ? null : s;
}

function buildQuery(f: PostOpFilter): { sql: string; params: SqlParams } {
  const conditions: string[] = ['i.opdate BETWEEN :start_date AND :end_date'];
  const params: SqlParams = {
    start_date: { value: f.startDate, value_type: 'date' },
    end_date:   { value: f.endDate,   value_type: 'date' },
  };

  if (f.doctorCode?.trim()) {
    conditions.push('i.doctor = :doctor_code');
    params.doctor_code = { value: f.doctorCode.trim(), value_type: 'string' };
  }

  if (f.icd9Filter?.trim()) {
    conditions.push('(i.icd9 LIKE :icd9_filter OR ic.name LIKE :icd9_filter)');
    params.icd9_filter = { value: `%${f.icd9Filter.trim()}%`, value_type: 'string' };
  }

  const sql = `
SELECT
  a.hn,
  a.an,
  CONCAT(pt.pname, pt.fname, ' ', pt.lname) AS patient_name,
  pt.cid                AS cid,
  pt.hometel            AS home_tel,
  pt.mobile_phone_number AS mobile_tel,
  pt.informtel          AS inform_tel,
  i.opdate              AS op_date,
  i.icd9                AS icd9_code,
  ic.name               AS icd9_name,
  d.name                AS doctor_name
FROM an_stat a
INNER JOIN iptoprt i  ON i.an   = a.an
LEFT  JOIN icd9cm1 ic ON ic.code = i.icd9
LEFT  JOIN patient pt ON pt.hn   = a.hn
LEFT  JOIN doctor  d  ON d.code  = i.doctor
WHERE ${conditions.join(' AND ')}
ORDER BY i.opdate DESC, a.hn
LIMIT 500
`.trim();

  return { sql, params };
}

export function usePostOpPatients(filter: PostOpFilter | null) {
  const { session } = useBmsSessionContext();
  const [rows, setRows] = useState<PostOpPatientRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterKey = filter ? JSON.stringify(filter) : null;

  useEffect(() => {
    if (!filter || !session) { setRows([]); return; }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const config: ConnectionConfig = {
      apiUrl: session.apiUrl,
      bearerToken: session.bearerToken,
      databaseType: session.databaseType,
      appIdentifier: APP_IDENTIFIER,
    };

    const { sql, params } = buildQuery(filter);

    executeSqlViaApiQueued(sql, config, params)
      .then((res) => {
        if (cancelled) return;
        const raw = (res.data ?? []) as Record<string, unknown>[];
        setRows(
          raw.map((r) => ({
            hn:          asStr(r.hn),
            an:          asStr(r.an),
            patientName: asStr(r.patient_name),
            cid:         asNullStr(r.cid),
            homeTel:     asNullStr(r.home_tel),
            mobileTel:   asNullStr(r.mobile_tel),
            informTel:   asNullStr(r.inform_tel),
            opDate:      asStr(r.op_date),
            icd9Code:    asStr(r.icd9_code),
            icd9Name:    asNullStr(r.icd9_name),
            doctorName:  asNullStr(r.doctor_name),
          })),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, session]);

  return { rows, isLoading, error };
}
