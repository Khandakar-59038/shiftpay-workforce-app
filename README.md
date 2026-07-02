# ShiftPay — Workforce Management

Work schedules, time tracking, leave management, and payroll disbursement for
workers, managers, and admins. Built from the client SRS (see
`docs/superpowers/specs/`).

## Quick start

```bash
npm install
npx prisma migrate dev   # creates prisma/dev.db
npm run db:seed          # demo accounts + three weeks of data
npm run dev              # http://localhost:3000
```

### Demo accounts (password: `demo1234`)

| Role    | Email                 |
| ------- | --------------------- |
| Admin   | admin@shiftpay.demo   |
| Manager | manager@shiftpay.demo |
| Worker  | alice@shiftpay.demo (also bob, carol, dave) |

## What it does

**Workers** — submit weekly or monthly schedules for approval, see worked
hours with overtime split out per ISO week, request paid/unpaid leave against
an annual balance, download timesheets (CSV) and payslips (print/PDF), and get
notified on every approval and payment.

**Managers** — approve/reject schedules and leave (with notes workers see),
view any worker's hours, adjust hours with an audit reason, get overtime
alerts past a configurable threshold, and run weekly/monthly payroll with a
full per-worker preview (regular + overtime×multiplier + paid leave −
unpaid-leave deduction) before disbursing in one transaction. Paid periods
can't be paid twice.

**Admins** — manage users (roles, hourly rates, password resets,
deactivation) and company policy (weekly hour limit, overtime multiplier and
alert threshold, leave allowance, standard day hours, currency, default pay
frequency).

## Stack

Next.js 15 (App Router, TypeScript) · Prisma + SQLite · Zod · bcryptjs + jose
(signed httpOnly session cookies) · Tailwind CSS v4 · Vitest.

All money is stored as integer cents; calendar dates as `YYYY-MM-DD` strings.
Business logic lives in pure, unit-tested modules under `src/lib/`
(`payroll.ts`, `leave.ts`, `dates.ts`, `hours.ts`); REST endpoints under
`src/app/api/` (SRS 4.2) are covered by integration tests against a throwaway
SQLite database.

## Commands

| Command           | What it does                       |
| ----------------- | ---------------------------------- |
| `npm run dev`     | dev server on :3000                |
| `npm run build`   | production build                   |
| `npm test`        | unit + API tests (95)              |
| `npm run db:seed` | reset + reseed demo data           |
| `npm run lint`    | eslint                             |

## Notes

- Payroll disbursement is simulated (recorded + notified); the REST API is the
  integration point for a real payroll provider later (SRS 4.2).
- `.env` needs `DATABASE_URL` and a random `SESSION_SECRET` (see
  `.env.example`).
