// Demo data: three roles, three weeks of schedules in mixed states, leave
// requests in every state, one completed payroll run, and notifications.
// Passwords are all "demo1234". Idempotent: wipes all rows first.

import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { addDays, formatDate, mondayOf, todayStr } from "../src/lib/dates";
import { formatCents } from "../src/lib/money";
import { maybeOvertimeAlert, notify, notifyManagers } from "../src/lib/notify";
import { computeWorkerPayroll } from "../src/lib/payroll-db";
import { getSettings } from "../src/lib/settings";

async function wipe() {
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.timeAdjustment.deleteMany();
  await prisma.scheduleDay.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.companySettings.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await wipe();
  await prisma.companySettings.create({ data: { id: 1 } });

  const password = await hashPassword("demo1234");
  const mk = (name: string, email: string, role: string, rate: number) =>
    prisma.user.create({
      data: { name, email, passwordHash: password, role, hourlyRateCents: rate },
    });

  const admin = await mk("Nadia Islam", "admin@shiftpay.demo", "ADMIN", 4000);
  const manager = await mk("Maya Rahman", "manager@shiftpay.demo", "MANAGER", 3500);
  const alice = await mk("Alice Chen", "alice@shiftpay.demo", "WORKER", 2400);
  const bob = await mk("Bob Torres", "bob@shiftpay.demo", "WORKER", 2000);
  const carol = await mk("Carol Osei", "carol@shiftpay.demo", "WORKER", 2800);
  const dave = await mk("Dave Karim", "dave@shiftpay.demo", "WORKER", 1800);

  const today = todayStr();
  const weekA = mondayOf(addDays(today, -14)); // fully in the past
  const thisWeek = mondayOf(today);

  const approvedWeek = (
    workerId: string,
    monday: string,
    hoursByDay: number[],
  ) =>
    prisma.schedule.create({
      data: {
        workerId,
        periodType: "WEEKLY",
        periodStart: monday,
        status: "APPROVED",
        decidedById: manager.id,
        decidedAt: new Date(),
        days: {
          create: hoursByDay
            .map((hours, i) => ({ date: addDays(monday, i), hours }))
            .filter((d) => d.hours > 0),
        },
      },
    });

  // ── Week A (two weeks ago): approved everywhere, feeds the payroll run ──
  await approvedWeek(alice.id, weekA, [9, 9, 10, 9, 9]); // 46h → 6h overtime
  await approvedWeek(bob.id, weekA, [8, 8, 8, 8, 8]);
  await approvedWeek(carol.id, weekA, [7.5, 7.5, 7.5, 7.5, 7.5]);
  await approvedWeek(dave.id, weekA, [8, 8, 8, 8, 6]);

  // Manager correction: Bob left an hour early on Tuesday of week A.
  await prisma.timeAdjustment.create({
    data: {
      workerId: bob.id,
      date: addDays(weekA, 1),
      deltaHours: -1,
      reason: "Left early — dentist appointment",
      createdById: manager.id,
    },
  });
  await notify(prisma, bob.id, {
    type: "HOURS_ADJUSTED",
    title: "Working hours adjusted",
    body: `Maya Rahman deducted 1h from your hours on ${formatDate(addDays(weekA, 1))}: dentist appointment.`,
    href: "/time",
  });

  // Approved leave inside week A: Carol paid Thursday, Dave unpaid Wednesday.
  await prisma.leaveRequest.create({
    data: {
      workerId: carol.id,
      type: "PAID",
      startDate: addDays(weekA, 3),
      endDate: addDays(weekA, 3),
      reason: "Medical appointment",
      status: "APPROVED",
      decidedById: manager.id,
      decidedAt: new Date(),
    },
  });
  await prisma.leaveRequest.create({
    data: {
      workerId: dave.id,
      type: "UNPAID",
      startDate: addDays(weekA, 2),
      endDate: addDays(weekA, 2),
      reason: "Personal day",
      status: "APPROVED",
      decidedById: manager.id,
      decidedAt: new Date(),
    },
  });

  // Overtime alert for Alice's 46h week.
  await maybeOvertimeAlert(alice.id, weekA);

  // ── Payroll run for week A, computed with the real engine ──
  const settings = await getSettings();
  const weekAEnd = addDays(weekA, 6);
  const run = await prisma.payrollRun.create({
    data: {
      periodStart: weekA,
      periodEnd: weekAEnd,
      frequency: "WEEKLY",
      processedById: manager.id,
      settingsSnapshot: JSON.stringify({
        weeklyHourLimit: settings.weeklyHourLimit,
        overtimeMultiplier: settings.overtimeMultiplier,
        standardDayHours: settings.standardDayHours,
        currencyCode: settings.currencyCode,
      }),
    },
  });
  for (const worker of [alice, bob, carol, dave]) {
    const result = await computeWorkerPayroll(worker, weekA, weekAEnd, settings);
    const payment = await prisma.payment.create({
      data: {
        payrollRunId: run.id,
        workerId: worker.id,
        periodStart: weekA,
        periodEnd: weekAEnd,
        regularHours: result.regularHours,
        overtimeHours: result.overtimeHours,
        paidLeaveHours: result.paidLeaveHours,
        grossRegularCents: result.grossRegularCents,
        grossOvertimeCents: result.grossOvertimeCents,
        paidLeaveCents: result.paidLeaveCents,
        deductionCents: result.deductionCents,
        netCents: result.netCents,
      },
    });
    await notify(prisma, worker.id, {
      type: "PAYMENT_PROCESSED",
      title: "Payment processed",
      body: `Your weekly payment of ${formatCents(result.netCents, settings.currencyCode)} for ${formatDate(weekA)} – ${formatDate(weekAEnd)} has been disbursed.`,
      href: `/payslip/${payment.id}`,
    });
  }

  // ── Current week: mixed statuses ──
  const pendingWeek = (workerId: string, hoursByDay: number[]) =>
    prisma.schedule.create({
      data: {
        workerId,
        periodType: "WEEKLY",
        periodStart: thisWeek,
        status: "PENDING",
        days: {
          create: hoursByDay
            .map((hours, i) => ({ date: addDays(thisWeek, i), hours }))
            .filter((d) => d.hours > 0),
        },
      },
    });

  await pendingWeek(alice.id, [8, 8, 8, 8, 8]);
  await pendingWeek(bob.id, [8, 9, 9, 8, 8]);
  await approvedWeek(carol.id, thisWeek, [7.5, 7.5, 7.5, 7.5, 7.5]);
  await prisma.schedule.create({
    data: {
      workerId: dave.id,
      periodType: "WEEKLY",
      periodStart: thisWeek,
      status: "REJECTED",
      decidedById: manager.id,
      decidedAt: new Date(),
      managerNote: "We're overstaffed on Friday — please move those hours earlier in the week.",
      days: {
        create: [8, 8, 8, 4, 12]
          .map((hours, i) => ({ date: addDays(thisWeek, i), hours })),
      },
    },
  });

  for (const w of [alice, bob]) {
    await notifyManagers(prisma, {
      type: "SCHEDULE_SUBMITTED",
      title: "Schedule awaiting approval",
      body: `${w.name} submitted a weekly schedule starting ${formatDate(thisWeek)}.`,
      href: "/approvals",
    });
  }
  await notify(prisma, dave.id, {
    type: "SCHEDULE_REJECTED",
    title: "Schedule rejected",
    body: `Your weekly schedule starting ${formatDate(thisWeek)} was rejected: “We're overstaffed on Friday — please move those hours earlier in the week.” Please update and resubmit.`,
    href: "/schedule",
  });

  // ── Leave requests in other states ──
  const nextMonday = mondayOf(addDays(today, 7));
  await prisma.leaveRequest.create({
    data: {
      workerId: bob.id,
      type: "UNPAID",
      startDate: nextMonday,
      endDate: addDays(nextMonday, 1),
      reason: "Moving apartments",
      status: "PENDING",
    },
  });
  await notifyManagers(prisma, {
    type: "LEAVE_REQUESTED",
    title: "Leave request awaiting approval",
    body: `Bob Torres requested 2 day(s) of unpaid leave (${formatDate(nextMonday)} – ${formatDate(addDays(nextMonday, 1))}).`,
    href: "/leave-approvals",
  });
  await prisma.leaveRequest.create({
    data: {
      workerId: alice.id,
      type: "PAID",
      startDate: addDays(weekA, -7),
      endDate: addDays(weekA, -6),
      reason: "Long weekend trip",
      status: "REJECTED",
      decidedById: manager.id,
      decidedAt: new Date(),
      managerNote: "Release week — can we do the following week instead?",
    },
  });

  const counts = {
    users: await prisma.user.count(),
    schedules: await prisma.schedule.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    payments: await prisma.payment.count(),
    notifications: await prisma.notification.count(),
  };
  console.log("Seeded:", counts);
  console.log("Accounts (password: demo1234):");
  for (const u of [admin, manager, alice, bob, carol, dave]) {
    console.log(`  ${u.role.padEnd(7)} ${u.email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
