# AI ผู้ช่วยพยาบาล — Progress Log

> **Resume-friendly.** Update after every meaningful step. Open this first when continuing.

---

## 🎯 Goal

สร้างหน้า "ทะเบียนนัดผ่าตัด One Day Case — โทรยืนยัน" ภายใน BMS Session Dashboard ที่:

1. ดึงรายการนัดจาก HOSxP `oapp` (`operation_appointment='Y'`, status<4)
2. แสดงคล้าย `HOSxPAppointmentListForm` พร้อม filter + KPI + table
3. ส่งคิวให้ AI โทรยืนยันผ่าน **หมอพร้อม (MOPH MorPhrom)** via `services/moph.ts` → `medai-screen-api.bmscloud.in.th`
4. รับ callback (status / transcript / events) แบบ SSE จาก medai-screen
5. แสดงผลใน Detail Drawer คล้าย medai-screen (workflow / clinical state / doctor plan / transcript / events)

---

## ⚙️ Resume Commands

```bash
# สถานะปัจจุบัน
cat .specify/features/ai-confirm-call/progress.md

# Typecheck (ต้อง clean)
npx tsc -b

# Tests
npx vitest run tests/unit/operationAppointments.test.ts   # 26 tests
npx vitest run tests/unit/callAttempts.test.ts            # 15 tests
npx vitest run tests/unit/aidx.test.ts                    # 14 tests
npm test                                                  # all 415 tests

# Coverage
npm run test:coverage

# Dev server
npm run dev   # → http://localhost:5173/appointments

# Build
npm run build

# Git log of feature commits
git log --oneline --grep="confirm-call\|operationAppointments\|callAttempts\|aidx\|appointment list"
```

---

## ✅ Done — Feature MVP shipped

| # | Step | Files | Tests |
|---|---|---|---|
| 1 | Design phase | wireframe + column spec + status taxonomy + SQL from KB | — |
| 2 | Types | `src/types/appointment.ts` | — |
| 3 | SQL service | `src/services/operationAppointments.ts` | 26 |
| 4 | Local store | `src/services/callAttempts.ts` + snapshot cache | 15 |
| 5 | AIDX integration | `src/services/aidx.ts` (enqueue / status / SSE / MorPhrom) | 14 |
| 6 | Hook | `src/hooks/useAppointments.ts` | (covered via page) |
| 7 | UI components | `src/components/appointments/*` (7 files) | — |
| 8 | Page + Route | `src/pages/AppointmentList.tsx`, `src/App.tsx`, `AppHeader.tsx` | — |
| 9 | Browser smoke | Playwright screenshot at `appointments-smoke-v2.png` | passed |

**Status:**
- ✅ `npx tsc -b` clean
- ✅ All 415 tests pass (was 360 before feature → +55 new tests for feature)
- ✅ Page renders end-to-end in the browser
- ✅ React `useSyncExternalStore` infinite-loop fixed
- ⚠️ The page expects a valid BMS session — without one, it shows the "Session unauthorized" error banner (intentional UX, not a bug)

---

## ⏭️ Follow-ups (out of MVP scope)

1. **Transcript / SSE wiring inside the drawer** — `subscribeCaseEvents` exists but the drawer doesn't subscribe yet. Add a `useCaseEvents(caseId)` hook to render the live transcript inside the drawer.
2. **Marketplace token requirement check** — `/api/sql` GETs work with JWT, but enqueueing writes audit rows in the future will need a marketplace token. Surface a warning if missing.
3. **MorPhrom service id** — currently hard-coded `bms-aidx-confirm`. Wire it through `sys_var` (HOSxP) or env config.
4. **Confirm/cancel write-back to HOSxP `oapp`** — when nurse confirms, write `note` back via `/api/rest/oapp`. Requires marketplace token READWRITE.
5. **Drawer enhancements** — add Working Diagnosis / Doctor Plan / Rx state sections (mirrors medai-screen layout).
6. **Add component tests** — currently the components only run via the smoke test. Add focused unit tests for `AppointmentTable` (selection logic) and `AppointmentDetailDrawer` (manual override).
7. **Coverage gate** — `npm run test:coverage` should be wired into CI with ≥80% threshold (constitution requires).

---

## 🧭 Key Decisions / Context

- **Call channel = หมอพร้อม (MOPH MorPhrom)** — *not* PSTN/SIP. Patient sees a LINE Flex card inside MorPhrom, opens it, lands at medai-screen for the conversation. **CID (13 digits)** is the primary identifier, not phone.
- **Repo scope** = Layer 1 (Data Integration) + Layer 4 (Application UI). Layers 2 (Telephony) + 3 (AI Engine) live in `medai-screen.bmscloud.in.th`.
- **HOSxP table** = `oapp` filtered by `operation_appointment='Y'` and `oapp_status_id < 4`.
- **Phone columns** are display-only for manual fallback. Fallback chain: `mobile_phone_number` → `home_phone_number` → `informtel`.
- **Status taxonomy** lives in app DB only (8 states: pending / queued / calling / confirmed / rescheduled / cancelled / no_answer / escalated / already_visited). Native `oapp_status_id` is shown but not overwritten.
- **Visual style** = medai-screen — minimalist clinical, neutral palette, card-based vertical sections, Thai status badges, SSE-driven event feed.

---

## 📂 Files Touched

| Path | Status |
|---|---|
| `src/types/appointment.ts` | ✅ created |
| `src/services/operationAppointments.ts` | ✅ created |
| `src/services/callAttempts.ts` | ✅ created (+ snapshot cache fix) |
| `src/services/aidx.ts` | ✅ created |
| `src/hooks/useAppointments.ts` | ✅ created |
| `src/components/appointments/AppointmentStatusBadge.tsx` | ✅ created |
| `src/components/appointments/AppointmentKpiCards.tsx` | ✅ created |
| `src/components/appointments/AppointmentFilterBar.tsx` | ✅ created |
| `src/components/appointments/AppointmentTable.tsx` | ✅ created |
| `src/components/appointments/AppointmentDetailDrawer.tsx` | ✅ created |
| `src/components/appointments/BulkCallQueueDialog.tsx` | ✅ created |
| `src/pages/AppointmentList.tsx` | ✅ created |
| `src/App.tsx` | ✅ added `/appointments` route |
| `src/components/layout/AppHeader.tsx` | ✅ added nav link |
| `tests/unit/operationAppointments.test.ts` | ✅ 26 tests |
| `tests/unit/callAttempts.test.ts` | ✅ 15 tests |
| `tests/unit/aidx.test.ts` | ✅ 14 tests |
| `.specify/features/ai-confirm-call/progress.md` | ✅ this file |

---

_Last updated: 2026-05-15_
