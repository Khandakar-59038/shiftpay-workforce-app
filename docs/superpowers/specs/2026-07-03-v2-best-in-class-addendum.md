# ShiftPay v2 — Best-in-class Addendum

**Date:** 2026-07-03. Client asked us to research leading shift-management
products and merge their best ideas into ShiftPay, using our judgment.

## Research inputs

Deputy (schedule views, copy schedule, manager dashboard), When I Work
(self-serve scheduling, fast setup), 7shifts (labor cost %), Shiftboard/
industry guidance (labor-cost visibility while scheduling; flag overtime
*before* publishing, not after), Gusto (payroll ease: sub-5-minute runs,
real-time calculation feedback, employee pay-stub access), and the client's
ShiftFlow design system ("show the math", consequence-stating warnings,
fixed status vocabulary).

## Adopted for v2

1. **Team Schedule Board** (manager) — week grid of workers × days with
   status-colored cells, per-day/per-worker totals, **projected labor cost**
   per day and week (overtime-aware), OT flags, inline approve/reject.
2. **Approval consequence warnings** — before deciding, managers see
   "Approving adds 6.5h overtime (≈ $234.00 at 1.5×)" per pending schedule.
3. **Copy last week** — one click fills the worker's schedule editor from the
   previous period.
4. **Manager dashboard: today's roster** — who's scheduled today, hours, who's
   on leave; plus this week's projected labor cost stat.
5. **Worker dashboard: next-7-days strip** — upcoming scheduled days at a
   glance.
6. **Worker Pay page** — full payment history with payslip links (Gusto-style
   employee pay-stub access); payslips gain **YTD gross/net**.
7. **Show the math** — payroll preview lines carry explicit breakdowns.

## Deliberately not adopted (roadmap)

- **Shift swaps / open shifts / auto-scheduling** — ShiftPay's SRS model is
  worker-proposed day-hours, not manager-assigned time slots; swaps need the
  slotted-shift model. Candidate for v3 with a schema change.
- **Clock-in/out punch tracking** — SRS derives hours from approved schedules
  + manager adjustments; a half-integrated time clock would undermine payroll
  correctness.
- **POS/demand forecasting integrations** — no data source in scope.

## New internals

- `src/lib/insights.ts` — pure `projectedOvertime()` and `laborCost()`
  (OT-aware, integer cents), unit-tested.
- `GET /api/schedule-board?weekStart=` — grid data + costs (manager/admin).
- `GET /api/schedules/[id]/impact` — projected OT hours/cost for a pending
  schedule (manager/admin).
- Worker `/pay` page; `/schedule-board` page; dashboard upgrades.
