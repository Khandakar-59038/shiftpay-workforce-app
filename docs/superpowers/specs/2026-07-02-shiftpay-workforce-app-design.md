# ShiftPay — Workforce Management Web App: Design Spec

**Date:** 2026-07-02
**Source:** Client SRS "Software Specification Requirement Document" (work schedules, time tracking, leave management, payroll disbursement).
**Decisions from client questionnaire:** Full-stack app · Next.js + SQLite · Real auth with seeded demo accounts · Extra: payslip & report export (CSV/PDF). Multi-language, dark mode, and admin 2FA deferred to a later version. Currency defaults to USD, configurable in admin settings.

## 1. Goal

A three-role (Worker / Manager / Admin) web application where workers set schedules and request leave, managers approve schedules/leave, monitor hours and overtime, and run payroll, and admins manage users and company policy. Fully functional end-to-end on a local machine.

## 2. Architecture

- **Framework:** Next.js 15 (App Router, TypeScript), single codebase at `~/workforce-app`.
- **Database:** SQLite via Prisma ORM (file `prisma/dev.db`). Swap-to-Postgres path preserved by using only portable Prisma types.
- **API:** REST route handlers under `/api/*` (satisfies SRS 4.2 future-integration requirement). All inputs validated with Zod. JSON error envelope `{ error: string }` with correct status codes (400/401/403/404/409).
- **Auth:** Email + password (bcrypt hashes), signed httpOnly session cookie (JWT via `jose`). Middleware + per-route guards enforce role access (SRS 3.3). No plaintext secrets in repo; session secret in `.env`.
- **UI:** React server/client components, custom design system (no generic template look), responsive.
- **Notifications:** In-app notification center (bell + page). Rows created transactionally with the events that trigger them (SRS 2.1.4, 2.2.5).

## 3. Data model (Prisma)

- `User`: id, name, email (unique), passwordHash, role (`WORKER|MANAGER|ADMIN`), hourlyRateCents (integer — all money stored as integer cents), isActive, timestamps.
- `CompanySettings` (singleton row): weeklyHourLimit (default 40), overtimeMultiplier (default 1.5), overtimeAlertThreshold (weekly OT hours that trigger manager alert, default 10), paidLeaveDaysPerYear (default 15), standardDayHours (default 8, used to value paid-leave days), currencyCode (default `USD`), payFrequencyDefault (`WEEKLY|MONTHLY`).
- `Schedule`: id, workerId, periodType (`WEEKLY|MONTHLY`), periodStart (date), status (`PENDING|APPROVED|REJECTED`), submittedAt, decidedById?, decidedAt?, managerNote?. Unique on (workerId, periodStart, periodType) for the active (non-rejected) schedule; resubmission after rejection creates a new version (previous marked superseded via `supersededById`).
- `ScheduleDay`: id, scheduleId, date, hours (0–24, quarter-hour granularity).
- `TimeAdjustment`: id, workerId, date, deltaHours (+/-), reason, createdById, createdAt. Worked hours for a date = approved ScheduleDay hours (for dates ≤ today) + sum of adjustments (SRS 2.2.2 manual adjust).
- `LeaveRequest`: id, workerId, type (`PAID|UNPAID`), startDate, endDate, reason, status (`PENDING|APPROVED|REJECTED`), decidedById?, decidedAt?, managerNote?.
- `PayrollRun`: id, periodStart, periodEnd, frequency, processedById, createdAt, settingsSnapshot (JSON of rates used).
- `Payment`: id, payrollRunId, workerId, regularHours, overtimeHours, paidLeaveHours, grossRegularCents, grossOvertimeCents, paidLeaveCents, deductionCents (unpaid leave), netCents, status (`PAID`), createdAt. One payment per worker per run; a period cannot be paid twice for the same worker (409 on overlap).
- `Notification`: id, userId, type, title, body, href?, readAt?, createdAt.

## 4. Business rules

- **Worked hours:** derived from APPROVED schedules only, for dates up to and including today, plus manager adjustments. Daily/weekly/monthly views (SRS 2.1.2, 2.2.2).
- **Overtime:** per ISO week, `max(0, workedHours − weeklyHourLimit)`; displayed separately everywhere. When a worker's weekly OT crosses `overtimeAlertThreshold`, managers get an alert notification (created when hours change via approval or adjustment).
- **Leave:** paid leave draws down annual balance (days). Balance = paidLeaveDaysPerYear − approved paid leave days in current year. Requests validate: range valid, no overlap with existing approved/pending leave, paid requests cannot exceed remaining balance. Approved leave days remove those days' schedule hours from "worked" and instead: paid leave pays `standardDayHours × hourlyRate` per weekday; unpaid leave pays nothing and is listed as a deduction line (SRS 2.2.4).
- **Payroll run:** manager picks frequency + period + workers (default all active). For each worker: regular hours, OT hours (OT paid at `hourlyRate × overtimeMultiplier`), paid-leave hours, unpaid-leave deduction shown explicitly. All money math in integer cents. Run is transactional; workers notified "Payment processed" (SRS 2.2.3, 5.4). Duplicate payment for an already-paid period → 409 with a clear message.
- **Schedule flow:** worker submits (weekly or monthly) → managers notified → approve/reject with optional note → worker notified; rejected schedules are editable and resubmittable (SRS 5.1, 5.2). Editing an approved schedule creates a new PENDING version requiring re-approval (SRS 2.1.1 "subject to manager approval").

## 5. Pages

- `/login` — email/password; demo-account hint panel.
- **Worker:** `/dashboard` (current schedule + status, hours this week/month, OT, leave balance, last payment), `/schedule` (calendar-style weekly/monthly editor, submit for approval, history), `/time` (daily/weekly/monthly tables, OT separated, timesheet export), `/leave` (request form, balance, history), `/notifications`.
- **Manager:** `/dashboard` (pending approvals count, OT alerts, upcoming payroll), `/approvals` (schedule review with day-by-day detail), `/team-time` (per-worker hours, OT flags, manual adjustment with reason), `/leave-approvals`, `/payroll` (run payroll wizard: pick period → preview per-worker breakdown → confirm; history of runs), `/notifications`.
- **Admin:** `/dashboard` (usage stats), `/users` (create/edit/deactivate users, set role + hourly rate, reset password), `/settings` (working-hour limit, OT multiplier + alert threshold, leave policy, pay frequency, currency).
- **Exports:** timesheet CSV (worker + manager), payslip per payment as printable PDF (browser print-optimized page) and payroll-run summary CSV.

## 6. Error handling

Zod validation on every API body/query; field-level messages surfaced inline in forms. Role guards return 403; unauthenticated → redirect to `/login`. Transactions around approve/reject + notification, payroll run, and adjustments. Empty states for all lists; toasts for mutations; destructive actions (reject, deactivate user) require confirm.

## 7. Testing

- **Unit (Vitest):** overtime calculation, payroll computation (regular/OT/paid leave/unpaid deduction, cents rounding), leave-balance validation, week bucketing.
- **API integration (Vitest + test SQLite db):** auth (login, role guards), schedule submit/approve/reject flow, leave flow, payroll run incl. duplicate-period 409.
- **Manual browser walkthrough** of all three roles with the seeded data before handover, plus responsive + accessibility pass (labels, focus, contrast).

## 8. Seed data

Admin `admin@shiftpay.demo`, manager `manager@shiftpay.demo`, workers `alice|bob|carol|dave@shiftpay.demo` (password `demo1234` for all), 3 weeks of schedules in mixed states, leave requests in each state, one completed past payroll run, sample notifications.

## 9. Out of scope (v1)

External payroll-provider integration (simulated disbursement records instead; REST API keeps it integration-ready), multi-language UI, dark mode, admin 2FA, email/push delivery (in-app only), clock-in/clock-out punch tracking (hours derive from approved schedules + adjustments per SRS).
