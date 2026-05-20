// =============================================================================
// App Settings Store — localStorage-backed, subscribe/notify pattern
// =============================================================================

const STORAGE_KEY = 'bms.appSettings.v1';

export interface AppSettings {
  /** ระยะเวลา (วินาที) ที่ popup เคส Escalate แสดงก่อน auto-dismiss: 3–30 */
  escalatedPopupDurationSec: number;
}

const DEFAULTS: AppSettings = {
  escalatedPopupDurationSec: 5,
};

const CLAMP = {
  escalatedPopupDurationSec: { min: 3, max: 30 },
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let current: AppSettings = { ...DEFAULTS };
const listeners: Set<() => void> = new Set();

function clamp(key: keyof typeof CLAMP, value: number): number {
  const { min, max } = CLAMP[key];
  return Math.max(min, Math.min(max, value));
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch { /* quota exceeded */ }
}

function load(): void {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (typeof parsed.escalatedPopupDurationSec === 'number') {
      current = {
        ...DEFAULTS,
        escalatedPopupDurationSec: clamp('escalatedPopupDurationSec', parsed.escalatedPopupDurationSec),
      };
    }
  } catch { /* corrupt */ }
}

load();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAppSettings(): AppSettings {
  return current;
}

export function updateAppSettings(patch: Partial<AppSettings>): void {
  const next = { ...current };
  if (typeof patch.escalatedPopupDurationSec === 'number') {
    next.escalatedPopupDurationSec = clamp('escalatedPopupDurationSec', patch.escalatedPopupDurationSec);
  }
  current = next;
  persist();
  notify();
}

export function resetAppSettings(): void {
  current = { ...DEFAULTS };
  persist();
  notify();
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const SETTINGS_CONSTRAINTS = CLAMP;
export const SETTINGS_DEFAULTS = DEFAULTS;
