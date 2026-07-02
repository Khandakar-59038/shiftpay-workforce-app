# ShiftPay Workforce App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full-stack ShiftPay workforce management app (schedules, time/overtime, leave, payroll, notifications, 3 roles) per the spec at `docs/superpowers/specs/2026-07-02-shiftpay-workforce-app-design.md`.

**Architecture:** Next.js 15 App Router monolith. REST route handlers under `src/app/api/*` with Zod validation call pure business-logic modules in `src/lib/*` (TDD'd with Vitest) over Prisma/SQLite. Session auth = bcrypt + signed JWT httpOnly cookie. UI = React + Tailwind v4, custom design system.

**Tech Stack:** Next.js 15 (TS), Prisma + SQLite, Zod, bcryptjs, jose, Vitest, Tailwind v4.

**Conventions (apply everywhere):**
- All money = **integer cents**. All hours = floats in 0.25 steps. All dates = `"YYYY-MM-DD"` strings (no Date-object TZ math for calendar dates).
- API errors: `{ error: string, fields?: Record<string,string> }` with 400/401/403/404/409.
- Every mutation that notifies someone creates the `Notification` row **in the same `prisma.$transaction`**.
- Commit after every task: `git add -A && git commit -m "..."`.

---

## File structure

```
prisma/schema.prisma, prisma/seed.ts
src/lib/db.ts          Prisma singleton
src/lib/dates.ts       date-string utils, ISO week keys, weekday count, ranges
src/lib/payroll.ts     pure payroll + overtime computation
src/lib/leave.ts       pure leave validation/balance math
src/lib/money.ts       cents ⇄ display formatting
src/lib/auth.ts        password hash/verify, session JWT create/read, requireUser/requireRole
src/lib/hours.ts       DB aggregation: worked hours per day/week from schedules+adjustments−leave
src/lib/notify.ts      notification creation helpers (tx-aware)
src/lib/api.ts         zod-parse wrapper + json/error helpers
src/middleware.ts      redirect unauthenticated → /login
src/app/api/...        REST endpoints (listed per task below)
src/app/(auth)/login/page.tsx
src/app/(app)/layout.tsx + role nav + notification bell
src/app/(app)/{dashboard,schedule,time,leave,notifications}/page.tsx        (worker+shared)
src/app/(app)/{approvals,team-time,leave-approvals,payroll}/page.tsx        (manager)
src/app/(app)/{users,settings}/page.tsx                                     (admin)
src/app/payslip/[paymentId]/page.tsx   print-optimized payslip
src/components/*       shared UI primitives (Button, Card, Table, Modal, Toast, Badge, EmptyState)
tests: colocated `src/lib/*.test.ts`; API tests `tests/api/*.test.ts` (fresh SQLite file per run)
```

### Data contracts (single source of truth)

```ts
// payroll.ts
export interface WeekHours { weekKey: string; hours: number }
export interface PayrollInputs {
  hourlyRateCents: number; weeklyHourLimit: number; overtimeMultiplier: number;
  standardDayHours: number; weeks: WeekHours[];        // worked hours (leave days excluded)
  paidLeaveDays: number; unpaidLeaveDays: number;      // approved weekday leave days in period
}
export interface PayrollResult {
  regularHours: number; overtimeHours: number; paidLeaveHours: number;
  grossRegularCents: number; grossOvertimeCents: number; paidLeaveCents: number;
  deductionCents: number;   // value of unpaid leave days (informational deduction line)
  grossCents: number;       // regular+OT+paidLeave+deduction  (pre-deduction gross)
  netCents: number;         // regular+OT+paidLeave            (gross − deduction)
}
```

Payslip math: worked hours already exclude leave days; unpaid leave is shown as gross line + equal deduction so `net = gross − deduction` always balances (SRS 2.2.3 deduction requirement).

Overtime per ISO week: `ot = max(0, hours − weeklyHourLimit)`, `regular = hours − ot`. Cents rounding: `Math.round(hours * rateCents)` per line.

---

### Task 1: Scaffold project & tooling
- [ ] `npx create-next-app@latest . --ts --eslint --tailwind --app --src-dir --no-import-alias --use-npm` (run in `~/workforce-app`; keep existing docs/.git)
- [ ] `npm i prisma @prisma/client zod bcryptjs jose && npm i -D vitest @types/bcryptjs tsx`
- [ ] Add `vitest.config.ts` (node env, include `src/**/*.test.ts` + `tests/**/*.test.ts`); scripts: `"test":"vitest run"`, `"db:seed":"tsx prisma/seed.ts"`.
- [ ] `.env`: `DATABASE_URL="file:./dev.db"`, `SESSION_SECRET=<random 32B hex>`; `.env` gitignored, add `.env.example`.
- [ ] Verify `npm run test` (no tests yet → passWithNoTests) and `npm run dev` boots. Commit "chore: scaffold Next.js app with tooling".

### Task 2: Prisma schema + client
- [ ] Write `prisma/schema.prisma` exactly:

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model User {
  id String @id @default(cuid())
  name String
  email String @unique
  passwordHash String
  role String            // WORKER | MANAGER | ADMIN
  hourlyRateCents Int @default(0)
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  schedules Schedule[] @relation("WorkerSchedules")
  leaveRequests LeaveRequest[] @relation("WorkerLeave")
  payments Payment[]
  notifications Notification[]
  adjustments TimeAdjustment[] @relation("WorkerAdjustments")
}

model CompanySettings {
  id Int @id @default(1)
  weeklyHourLimit Float @default(40)
  overtimeMultiplier Float @default(1.5)
  overtimeAlertThreshold Float @default(10)
  paidLeaveDaysPerYear Int @default(15)
  standardDayHours Float @default(8)
  currencyCode String @default("USD")
  payFrequencyDefault String @default("WEEKLY")
}

model Schedule {
  id String @id @default(cuid())
  workerId String
  worker User @relation("WorkerSchedules", fields: [workerId], references: [id])
  periodType String      // WEEKLY | MONTHLY
  periodStart String     // YYYY-MM-DD (Monday or 1st)
  status String @default("PENDING") // PENDING|APPROVED|REJECTED|SUPERSEDED
  submittedAt DateTime @default(now())
  decidedById String?
  decidedAt DateTime?
  managerNote String?
  days ScheduleDay[]
}

model ScheduleDay {
  id String @id @default(cuid())
  scheduleId String
  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  date String            // YYYY-MM-DD
  hours Float
  @@unique([scheduleId, date])
}

model TimeAdjustment {
  id String @id @default(cuid())
  workerId String
  worker User @relation("WorkerAdjustments", fields: [workerId], references: [id])
  date String
  deltaHours Float
  reason String
  createdById String
  createdAt DateTime @default(now())
}

model LeaveRequest {
  id String @id @default(cuid())
  workerId String
  worker User @relation("WorkerLeave", fields: [workerId], references: [id])
  type String            // PAID | UNPAID
  startDate String
  endDate String
  reason String
  status String @default("PENDING") // PENDING|APPROVED|REJECTED
  decidedById String?
  decidedAt DateTime?
  managerNote String?
  createdAt DateTime @default(now())
}

model PayrollRun {
  id String @id @default(cuid())
  periodStart String
  periodEnd String
  frequency String       // WEEKLY | MONTHLY
  processedById String
  settingsSnapshot String // JSON
  createdAt DateTime @default(now())
  payments Payment[]
}

model Payment {
  id String @id @default(cuid())
  payrollRunId String
  payrollRun PayrollRun @relation(fields: [payrollRunId], references: [id])
  workerId String
  worker User @relation(fields: [workerId], references: [id])
  periodStart String
  periodEnd String
  regularHours Float
  overtimeHours Float
  paidLeaveHours Float
  grossRegularCents Int
  grossOvertimeCents Int
  paidLeaveCents Int
  deductionCents Int
  netCents Int
  status String @default("PAID")
  createdAt DateTime @default(now())
}

model Notification {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  type String
  title String
  body String
  href String?
  readAt DateTime?
  createdAt DateTime @default(now())
}
```

- [ ] `src/lib/db.ts` Prisma singleton (globalThis cache for dev hot-reload).
- [ ] `npx prisma migrate dev --name init`. Commit "feat: prisma schema and client".

### Task 3: dates.ts (TDD)
- [ ] Failing tests `src/lib/dates.test.ts` for: `addDays("2026-06-30",2)==="2026-07-02"`; `isoWeekKey("2026-01-01")==="2026-W01"`, `isoWeekKey("2027-01-01")==="2026-W53"` (boundary), `isoWeekKey("2026-07-02")==="2026-W27"`; `eachDate("2026-07-01","2026-07-03")` → 3 dates; `weekdayCount("2026-07-03","2026-07-06")===2` (Fri+Mon); `mondayOf("2026-07-02")==="2026-06-29"`; `monthRange("2026-07")` → `["2026-07-01","2026-07-31"]`; `formatDate` human output; validation helper `isValidDate`.
- [ ] Run → fail. Implement with UTC-noon Date construction internally (TZ-safe). Run → pass. Commit "feat: date utilities".

### Task 4: payroll.ts + money.ts (TDD)
- [ ] Failing tests `src/lib/payroll.test.ts` (rate $20/h=2000c, limit 40, ×1.5, day 8h):
  - no OT: weeks `[38]` → regular 38, net 76_000c.
  - OT: weeks `[45]` → regular 40, OT 5, grossOT 15_000c, net 95_000c.
  - multi-week OT independence: `[45, 35]` → OT 5 only.
  - paid leave: 2 days → paidLeaveHours 16, paidLeaveCents 32_000, included in net.
  - unpaid leave: 1 day → deductionCents 16_000, gross 16_000 more than net; net excludes it.
  - rounding: rate 1234c, 0.25h week → `Math.round` behavior asserted.
  - zero/empty inputs → all zeros.
- [ ] `src/lib/money.test.ts`: `formatCents(123456,"USD")==="$1,234.56"`; BDT symbol `৳`.
- [ ] Run → fail. Implement `computePayroll(inputs): PayrollResult` (pure) + `formatCents`. Run → pass. Commit "feat: payroll and money math".

### Task 5: leave.ts (TDD)
- [ ] Failing tests: `paidLeaveBalance(allowance=15, approvedPaidWeekdaysThisYear=4) === 11`; `validateLeaveRequest` rejects: end<start, overlap with existing PENDING/APPROVED range, paid request exceeding balance; accepts valid; `leaveDaysInRange` counts weekdays only and clips to period.
- [ ] Implement pure functions (take arrays, no DB). Run → pass. Commit "feat: leave logic".

### Task 6: auth.ts + login/logout API + middleware
- [ ] `src/lib/auth.ts`: `hashPassword/verifyPassword` (bcryptjs, 10 rounds); `createSession(user)` → jose-signed JWT `{sub,role,name}` 7d in `shiftpay_session` httpOnly cookie; `getSession()`; `requireUser()`, `requireRole("MANAGER"|"ADMIN"|...)` throwing typed `ApiError(401/403)`.
- [ ] `src/lib/api.ts`: `handle(fn)` wrapper catching `ApiError`/`ZodError` → error envelope; `parse(schema, data)`.
- [ ] `POST /api/auth/login` (zod: email+password; inactive users rejected), `POST /api/auth/logout`.
- [ ] `src/middleware.ts`: no valid cookie + non-`/login`/non-API path → redirect `/login`.
- [ ] Integration test `tests/api/auth.test.ts`: seeds a user in temp DB, wrong password → 401, right → Set-Cookie, role guard 403 path. Run → pass. Commit "feat: session auth".

### Task 7: hours.ts (TDD with test DB)
- [ ] `workedHoursByDate(workerId, from, to)`: APPROVED ScheduleDay hours for dates ≤ today, minus days inside APPROVED leave, plus TimeAdjustments summed per date (floor at 0).
- [ ] `bucketWeeks(byDate)` → `WeekHours[]` via `isoWeekKey`. `summarize(workerId, from, to, settings)` → `{byDate, weeks, totalHours, overtimeHours}`.
- [ ] Tests cover: pending schedule excluded, future dates excluded, leave day zeroed, adjustment applied, week bucketing across month boundary. Commit "feat: worked-hours aggregation".

### Task 8: Schedules API
- [ ] `POST /api/schedules` (worker): zod `{periodType, periodStart, days:[{date,hours}]}`; validates dates within period, hours 0–24 in 0.25 steps, no active (PENDING/APPROVED) schedule for same period unless resubmitting → marks old `SUPERSEDED` in tx; notifies all managers.
- [ ] `GET /api/schedules?worker=me|all&status=` (workers see own; managers all).
- [ ] `POST /api/schedules/[id]/decision` (manager): `{action:"APPROVE"|"REJECT", note?}`; 409 if not PENDING; tx: update + notify worker; on approve, run OT-alert check (worker's weekly OT ≥ threshold → notify managers).
- [ ] Tests: full submit→approve flow, reject→resubmit supersedes, worker cannot decide (403), double-decide 409. Commit "feat: schedule workflow API".

### Task 9: Leave API
- [ ] `POST /api/leave` (worker) using `leave.ts` validation (balance via DB approved-paid-days this year); notifies managers. `GET /api/leave?worker=` with balance summary. `POST /api/leave/[id]/decision` (manager) tx + notify worker.
- [ ] Tests: paid-over-balance 400, overlap 400, approve flow updates balance, unpaid always allowed (no balance check). Commit "feat: leave API".

### Task 10: Time & adjustments API
- [ ] `GET /api/time?workerId=&from=&to=&granularity=day|week|month` (worker: self only; manager: anyone) → uses `hours.summarize`, returns OT separately.
- [ ] `POST /api/time/adjustments` (manager): `{workerId,date,deltaHours,reason}`; tx create + notify worker + OT-alert check.
- [ ] Tests: self-only guard, adjustment reflected in summary, OT alert notification created when threshold crossed. Commit "feat: time tracking API".

### Task 11: Payroll API
- [ ] `GET /api/payroll/preview?frequency=&periodStart=` → computes period end (week: +6d; month: last day), and for each active worker: hours via `hours.ts`, leave days via `leave.ts`, result via `computePayroll`; flags workers already paid for an overlapping period.
- [ ] `POST /api/payroll/run` (manager): same computation inside tx; 409 if any selected worker has a Payment overlapping the period; stores `PayrollRun` + `Payment`s + settingsSnapshot; notifies each worker "Payment processed".
- [ ] `GET /api/payroll` history with payments; `GET /api/payroll/payments/[id]` (worker: own only) for payslip.
- [ ] Tests: run creates payments matching `computePayroll` for a crafted fixture (approved schedule 45h + 1 paid + 1 unpaid leave day), duplicate run → 409, worker forbidden from running. Commit "feat: payroll API".

### Task 12: Users, settings, notifications API
- [ ] Admin `GET/POST /api/users`, `PATCH /api/users/[id]` (name, role, rate, isActive, password reset); cannot deactivate self; email uniqueness 409.
- [ ] `GET/PATCH /api/settings` (admin) with zod bounds (limit 1–80, multiplier 1–5, etc.).
- [ ] `GET /api/notifications` (own, newest first), `POST /api/notifications/read` `{ids?|all:true}`. `GET /api/me` for shell.
- [ ] Tests: role guards, settings validation, mark-read. Commit "feat: admin + notifications API".

### Task 13: Seed script
- [ ] `prisma/seed.ts`: settings row; admin/manager (+manager2 optional) and 4 workers (`*@shiftpay.demo` / `demo1234`, rates $18–$28); 3 weeks of schedules per worker: past weeks APPROVED (one with 46h → OT), current week mix PENDING/APPROVED, one REJECTED with note; leave: one approved PAID, one pending UNPAID, one rejected; one TimeAdjustment; one completed PayrollRun for last week with payments + notifications; assorted unread notifications.
- [ ] `npm run db:seed` idempotent (deletes all rows first). Verify counts printed. Commit "feat: seed data".

### Task 14: UI shell + login (use frontend-design skill)
- [ ] Design system tokens in `globals.css` (distinctive palette, typography), shared components in `src/components/`.
- [ ] `/login` page with demo-account quick-fill chips; error states.
- [ ] `(app)/layout.tsx`: sidebar nav filtered by role, header with notification bell (unread count, dropdown, mark-read), user menu with logout. Commit "feat: app shell and login UI".

### Task 15: Worker UI
- [ ] `/dashboard` (worker variant): schedule status card, hours this week (regular vs OT), leave balance, last payment, recent notifications.
- [ ] `/schedule`: week/month picker → per-day hour inputs (0.25 steps), total preview, submit; history list with status badges + manager notes; resubmit on rejected; edit-approved warns re-approval needed.
- [ ] `/time`: day/week/month tabs, tables with OT column, totals, CSV export button (`/api/export/timesheet?from&to`).
- [ ] `/leave`: balance card, request form (type/date range/reason with live validation), history table.
- [ ] `/notifications`: full list, mark all read. Commit "feat: worker UI".

### Task 16: Manager UI
- [ ] `/dashboard` (manager variant): pending schedules/leave counts, OT alerts, last payroll run.
- [ ] `/approvals`: pending schedule cards with day-by-day grid, approve/reject (+note modal).
- [ ] `/team-time`: worker selector + period, hours/OT table, "Adjust hours" modal (date, ±hours, reason).
- [ ] `/leave-approvals`: pending + history, balances shown, approve/reject.
- [ ] `/payroll`: wizard (frequency → period → preview table with per-worker breakdown and already-paid flags → confirm) + run history with links to payslips + run CSV export. Commit "feat: manager UI".

### Task 17: Admin UI
- [ ] `/dashboard` (admin variant): user counts by role, schedules/leave/payroll totals.
- [ ] `/users`: table + create/edit modal (role, rate, active, password), deactivate confirm.
- [ ] `/settings`: policy form (hour limit, OT multiplier + alert threshold, leave days/year, standard day hours, currency, default frequency) with validation + saved toast. Commit "feat: admin UI".

### Task 18: Exports & payslip
- [ ] `GET /api/export/timesheet` (CSV: date, scheduled, adjustments, worked, OT flag) and `GET /api/export/payroll-run/[id]` (CSV per payment).
- [ ] `/payslip/[paymentId]`: print-optimized page (company header, worker, period, line items: regular/OT/paid leave/gross/deduction/net, status PAID) + "Download PDF" via `window.print()` print stylesheet. Commit "feat: exports and payslip".

### Task 19: Final verification
- [ ] `npm run test` all green; `npm run build` clean; ESLint clean.
- [ ] Browser walkthrough (preview tools) as worker → manager → admin covering SRS use cases 5.1–5.4; fix everything found.
- [ ] Responsive + a11y pass (labels, focus rings, contrast). README with setup/run instructions + demo accounts. Commit "docs: README" / fixes.

---

## Self-review notes
- **Spec coverage:** SRS 2.1 (Tasks 8,10,9,12-notif,15), 2.2 (8,10,11,9,12,16), 2.3 (12,17), 3.x (auth/middleware Task 6; perf via server components; validation everywhere), 4.1 (Task 2), 4.2 REST API (all API tasks), 4.3 dashboards (15–17), 5.x use cases (Task 19 walkthrough), exports extra (Task 18). No gaps.
- **Type consistency:** `PayrollInputs/PayrollResult` defined once above; `WeekHours` shared by `hours.ts` and `payroll.ts`; date strings everywhere.
- **Deviation note:** UI tasks specify structure/behavior rather than full markup because the plan executor is the same agent in-session using the frontend-design skill for the visual layer.
