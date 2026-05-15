# AI ผู้ช่วยพยาบาล — Progress Log

> **Resume-friendly.** This file is updated after every meaningful step so any new session can pick up without losing context. Open it first when continuing this feature.

---

## 🎯 Goal

สร้างหน้า "ทะเบียนนัดผ่าตัด One Day Case — โทรยืนยัน" ภายใน BMS Session Dashboard ที่:

1. ดึงรายการนัดจาก HOSxP `oapp` (`operation_appointment='Y'`, status<4)
2. แสดงคล้าย `HOSxPAppointmentListForm` พร้อม filter + KPI + table
3. ส่งคิวให้ AI โทรยืนยันผ่าน **หมอพร้อม (MOPH MorPhrom)** via `services/moph.ts` → `medai-screen-api.bmscloud.in.th`
4. รับ callback (status / transcript / events) แบบ SSE จาก medai-screen
5. แสดงผลใน Detail Drawer คล้าย medai-screen (workflow / clinical state / doctor plan / transcript / events)

**Reference docs:**
- `docs/top_level_overview.docx` — ภาพรวมระบบ
- `docs/top_level_architecture.docx` — 4 Layer Architecture
- `docs/BMS-SESSION-FOR-DEV.md` — BMS Session API spec
- `.specify/memory/constitution.md` — TDD-non-negotiable + 4 test layers + 80% coverage
- Visual reference: `https://medai-screen.bmscloud.in.th/aidx` (BMS AIDX Assistant)

---

## ⚙️ Resume Commands

จะใช้คำสั่งพวกนี้บ่อยมาก — copy-paste ได้เลย:

```bash
# ดูสถานะปัจจุบัน
cat .specify/features/ai-confirm-call/progress.md

# Type-check (constitution บังคับให้ผ่านก่อน commit / push)
npx tsc -b

# รัน test สำหรับ feature นี้เท่านั้น
npx vitest run tests/unit/operationAppointments.test.ts

# รัน test ครอบคลุมทั้งโปรเจกต์
npm test

# Coverage report (constitution บังคับ ≥ 80%)
npm run test:coverage

# Dev server (background)
npm run dev          # → http://localhost:5173

# Lint
npm run lint

# Build (ทำ tsc -b + vite build)
npm run build

# Git: ดู commits ของ feature นี้
git log --oneline -- src/services/operationAppointments.ts src/types/appointment.ts src/pages/AppointmentList.tsx
```

---

## ✅ Done

ทำเสร็จแล้วและ commit แล้ว — ตามลำดับ:

- [x] **Design phase** — wireframe + column spec + status taxonomy + SQL จาก HOSxP KB → user approved
- [x] **Types** — `src/types/appointment.ts` (Appointment, CallStatus, CallAttempt, AppointmentFilter, AppointmentKpis, BestContact)
- [x] **Failing tests** — `tests/unit/operationAppointments.test.ts` (~30 cases: SQL shape, params, parse, fallback, list end-to-end)

---

## ⏭️ Next (in order)

1. **Implement `src/services/operationAppointments.ts`** เพื่อทำให้ tests pass
   - exports: `buildAppointmentSql`, `buildAppointmentParams`, `parseAppointmentRow`, `bestContactFor`, `listOneDayCaseAppointments`
   - ใช้ `executeSqlViaApiQueued` จาก `bmsSession.ts`
   - Run: `npx vitest run tests/unit/operationAppointments.test.ts` → ต้อง green ทั้งหมด
   - Then: `npx tsc -b` → ต้อง 0 errors

2. **Call-attempt store** (`src/services/callAttempts.ts` + tests)
   - in-memory + `localStorage` keyed by `oappId`
   - exports: `getCallAttempt`, `upsertCallAttempt`, `subscribeCallAttempts`

3. **aidx integration** (`src/services/aidx.ts` + tests)
   - `enqueueConfirmCall(appointment, options)` → POST `medai-screen-api.bmscloud.in.th/...`
   - `sendMorPhromInvite(appointment, link)` → wraps `sendMophNotification` from `moph.ts`
   - `subscribeCaseEvents(caseId, cb)` → SSE via `EventSource`

4. **Hook** `src/hooks/useAppointments.ts`
   - filter state + query (use `useQuery`) + merged with `callAttempts` store

5. **UI components** `src/components/appointments/*`
   - `AppointmentFilterBar`, `AppointmentKpiCards`, `AppointmentTable`, `AppointmentStatusBadge`, `AppointmentRowActions`, `AppointmentDetailDrawer`, `CallTimeline`, `CallTranscriptViewer`, `BulkCallQueueDialog`

6. **Route + Page** `src/pages/AppointmentList.tsx` + add route in `src/App.tsx`
   - Add nav link in `src/components/layout/AppHeader.tsx`

7. **Browser smoke** — start dev server, navigate `/appointments`, screenshot

8. **Final verification** — `npx tsc -b` clean, `npm test` green, `npm run test:coverage` ≥ 80%

---

## 🧭 Key Decisions / Context

- **Call channel = หมอพร้อม (MOPH MorPhrom)** — *not* PSTN/SIP. Patient sees the AI call as a LINE Flex message inside the MorPhrom app, opens it, and is taken to medai-screen for the conversation. Identifier is **CID (13 digits)**, not phone.
- **Repo scope** = Layer 1 (Data Integration) + Layer 4 (Application UI) of the 4-layer architecture. Layers 2 (Telephony) + 3 (AI Engine) live in `medai-screen.bmscloud.in.th`.
- **HOSxP table** = `oapp` filtered by `operation_appointment='Y'` and `oapp_status_id < 4`.
- **Phone columns** are for display only (so the nurse can still call manually if MorPhrom fails). Fallback chain: `mobile_phone_number` → `home_phone_number` → `informtel`.
- **Status taxonomy** lives in app DB only (8 states: pending / queued / calling / confirmed / rescheduled / cancelled / no_answer / escalated). Native `oapp_status_id` is shown but not overwritten.
- **Visual style** = match medai-screen — minimalist clinical, neutral palette, card-based vertical sections, Thai status badges, SSE-driven event feed in the drawer.

---

## 📂 Files Touched / Planned

| Path | Status | Tests |
|---|---|---|
| `src/types/appointment.ts` | ✅ done | (typed only) |
| `tests/unit/operationAppointments.test.ts` | ✅ done (red) | — |
| `src/services/operationAppointments.ts` | ⏳ next | covered |
| `src/services/callAttempts.ts` | ⏳ planned | needed |
| `src/services/aidx.ts` | ⏳ planned | needed |
| `src/hooks/useAppointments.ts` | ⏳ planned | needed |
| `src/components/appointments/*` | ⏳ planned | component tests |
| `src/pages/AppointmentList.tsx` | ⏳ planned | integration test |
| `src/App.tsx` + `AppHeader.tsx` | ⏳ planned | — |
| `.specify/features/ai-confirm-call/progress.md` | ✅ this file | — |

---

_Last updated: 2026-05-15_
