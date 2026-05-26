import type { FollowUpTemplate, FollowUpSchedule } from '@/types/followUpSchedule';

const TEMPLATES_KEY  = 'bms.aiconfirm.followUpTemplates.v1';
const SCHEDULES_KEY  = 'bms.aiconfirm.followUpSchedules.v1';

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: FollowUpTemplate[] = [
  { id: 'tka',      name: 'TKA / THA',       days: [1, 3, 7, 14, 30] },
  { id: 'general',  name: 'ผ่าตัดทั่วไป',    days: [1, 7, 30]        },
  { id: 'laparos',  name: 'ส่องกล้อง',        days: [1, 3, 7]         },
];

// ---------------------------------------------------------------------------
// Template store
// ---------------------------------------------------------------------------

function readTemplates(): FollowUpTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as FollowUpTemplate[];
    return parsed.length > 0 ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

// Stable snapshot cache for useSyncExternalStore
let templateSnapshot: FollowUpTemplate[] = readTemplates();
let scheduleSnapshot: FollowUpSchedule[] = readSchedules();

function writeTemplates(templates: FollowUpTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  templateSnapshot = templates;
  emitTemplates();
}

const templateListeners = new Set<() => void>();
function emitTemplates() { templateListeners.forEach((fn) => fn()); }

export function subscribeTemplates(fn: () => void): () => void {
  templateListeners.add(fn);
  return () => templateListeners.delete(fn);
}

export function getTemplates(): FollowUpTemplate[] { return templateSnapshot; }

export function saveTemplate(t: FollowUpTemplate): void {
  const list = readTemplates();
  const idx  = list.findIndex((x) => x.id === t.id);
  if (idx >= 0) list[idx] = t; else list.push(t);
  writeTemplates(list);
}

export function deleteTemplate(id: string): void {
  writeTemplates(readTemplates().filter((t) => t.id !== id));
}

// ---------------------------------------------------------------------------
// Schedule store
// ---------------------------------------------------------------------------

function readSchedules(): FollowUpSchedule[] {
  try {
    const raw = localStorage.getItem(SCHEDULES_KEY);
    return raw ? (JSON.parse(raw) as FollowUpSchedule[]) : [];
  } catch {
    return [];
  }
}

function writeSchedules(schedules: FollowUpSchedule[]): void {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  scheduleSnapshot = schedules;
  emitSchedules();
}

const scheduleListeners = new Set<() => void>();
function emitSchedules() { scheduleListeners.forEach((fn) => fn()); }

export function subscribeSchedules(fn: () => void): () => void {
  scheduleListeners.add(fn);
  return () => scheduleListeners.delete(fn);
}

export function getAllSchedules(): FollowUpSchedule[] { return scheduleSnapshot; }

export function getSchedulesForAn(an: string): FollowUpSchedule[] {
  return scheduleSnapshot.filter((s) => s.an === an);
}

export function getNextDueSchedule(an: string): FollowUpSchedule | null {
  const today = new Date().toISOString().slice(0, 10);
  const pending = scheduleSnapshot
    .filter((s) => s.an === an && !s.completedAt && s.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending[0] ?? null;
}

export function getOverdueSchedules(an: string): FollowUpSchedule[] {
  const today = new Date().toISOString().slice(0, 10);
  return scheduleSnapshot
    .filter((s) => s.an === an && !s.completedAt && s.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Generate schedules for a list of patients from a template, skipping ANs that already have schedules */
export function applyTemplateToPatients(
  patients: { an: string; hn: string; opDate: string }[],
  template: FollowUpTemplate,
  overwrite = false,
): void {
  const all = readSchedules();
  const existingAns = new Set(all.map((s) => s.an));
  const newSchedules: FollowUpSchedule[] = [];

  for (const p of patients) {
    if (!overwrite && existingAns.has(p.an)) continue;
    const filtered = overwrite ? all.filter((s) => s.an !== p.an) : all;
    if (overwrite) all.splice(0, all.length, ...filtered);

    const base = new Date(p.opDate);
    if (isNaN(base.getTime())) continue;

    for (const day of template.days) {
      const due = new Date(base);
      due.setDate(due.getDate() + day);
      newSchedules.push({
        id:        `${p.an}_d${day}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        an:        p.an,
        hn:        p.hn,
        dueDate:   due.toISOString().slice(0, 10),
        dayOffset: day,
      });
    }
  }

  writeSchedules([...all, ...newSchedules]);
}

export function addManualSchedule(an: string, hn: string, dueDate: string, label?: string): void {
  const all = readSchedules();
  all.push({ id: `${an}_m_${Date.now()}`, an, hn, dueDate, dayOffset: 0, label });
  writeSchedules(all);
}

export function completeSchedule(id: string, completedBy: string, note?: string): void {
  const all = readSchedules().map((s) =>
    s.id === id
      ? { ...s, completedAt: new Date().toISOString(), completedBy, note: note ?? s.note }
      : s,
  );
  writeSchedules(all);
}

export function deleteSchedule(id: string): void {
  writeSchedules(readSchedules().filter((s) => s.id !== id));
}

export function clearSchedulesForAn(an: string): void {
  writeSchedules(readSchedules().filter((s) => s.an !== an));
}
