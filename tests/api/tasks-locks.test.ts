import { beforeEach, describe, expect, it } from "vitest";
import { GET as listTasks, POST as createTask } from "../../src/app/api/tasks/route";
import { PATCH as patchTask } from "../../src/app/api/tasks/[id]/route";
import { GET as listLocks, POST as lockWeek } from "../../src/app/api/week-locks/route";
import { prisma } from "../../src/lib/db";
import { addDays, mondayOf, todayStr } from "../../src/lib/dates";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

describe("quick tasks", () => {
  it("manager assigns a task; worker is notified and completes it", async () => {
    const manager = await createUser("MANAGER");
    const worker = await createUser("WORKER");

    const res = await createTask(
      jsonRequest("/api/tasks", {
        cookie: await authCookie(manager),
        body: { title: "Restock shelf 4", assigneeId: worker.id, dueDate: todayStr() },
      }),
    );
    expect(res.status).toBe(201);
    const { task } = await res.json();

    const assigned = await prisma.notification.findFirst({
      where: { userId: worker.id, type: "TASK_ASSIGNED" },
    });
    expect(assigned).not.toBeNull();

    const done = await patchTask(
      jsonRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        cookie: await authCookie(worker),
        body: { status: "DONE" },
      }),
      { params: Promise.resolve({ id: task.id }) },
    );
    expect(done.status).toBe(200);

    const completedNote = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "TASK_COMPLETED" },
    });
    expect(completedNote).not.toBeNull();
  });

  it("workers can create personal tasks but not assign to others", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const cookie = await authCookie(worker);

    const personal = await createTask(
      jsonRequest("/api/tasks", { cookie, body: { title: "Renew certificate", assigneeId: worker.id } }),
    );
    expect(personal.status).toBe(201);

    const forbidden = await createTask(
      jsonRequest("/api/tasks", { cookie, body: { title: "Do my shift", assigneeId: other.id } }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("workers see only their own tasks", async () => {
    const manager = await createUser("MANAGER");
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const managerCookie = await authCookie(manager);
    for (const assigneeId of [worker.id, other.id]) {
      await createTask(
        jsonRequest("/api/tasks", { cookie: managerCookie, body: { title: "t", assigneeId } }),
      );
    }

    const res = await listTasks(
      jsonRequest("/api/tasks", { method: "GET", cookie: await authCookie(worker) }),
    );
    const { tasks } = await res.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignee.id).toBe(worker.id);
  });
});

describe("week locks", () => {
  it("locks a past week and notifies managers with the total", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const lastMonday = mondayOf(addDays(todayStr(), -7));
    await prisma.schedule.create({
      data: {
        workerId: worker.id,
        periodType: "WEEKLY",
        periodStart: lastMonday,
        status: "APPROVED",
        days: { create: [0, 1, 2, 3, 4].map((i) => ({ date: addDays(lastMonday, i), hours: 8 })) },
      },
    });

    const res = await lockWeek(
      jsonRequest("/api/week-locks", {
        cookie: await authCookie(worker),
        body: { weekStart: lastMonday, note: "All correct" },
      }),
    );
    expect(res.status).toBe(201);
    const { summary } = await res.json();
    expect(summary.totalHours).toBe(40);

    const note = await prisma.notification.findFirst({
      where: { userId: manager.id, type: "WEEK_LOCKED" },
    });
    expect(note?.body).toMatch(/40h/);
  });

  it("rejects duplicate and future locks", async () => {
    const worker = await createUser("WORKER");
    await createUser("MANAGER");
    const cookie = await authCookie(worker);
    const thisMonday = mondayOf(todayStr());

    expect((await lockWeek(jsonRequest("/api/week-locks", { cookie, body: { weekStart: thisMonday } }))).status).toBe(201);
    expect((await lockWeek(jsonRequest("/api/week-locks", { cookie, body: { weekStart: thisMonday } }))).status).toBe(409);
    expect(
      (
        await lockWeek(
          jsonRequest("/api/week-locks", {
            cookie,
            body: { weekStart: addDays(thisMonday, 7) },
          }),
        )
      ).status,
    ).toBe(400);

    const locks = await (
      await listLocks(jsonRequest("/api/week-locks", { method: "GET", cookie }))
    ).json();
    expect(locks.locks).toHaveLength(1);
  });
});
