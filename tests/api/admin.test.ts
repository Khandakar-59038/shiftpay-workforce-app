import { beforeEach, describe, expect, it } from "vitest";
import { GET as listUsers, POST as createUserRoute } from "../../src/app/api/users/route";
import { PATCH as patchUser } from "../../src/app/api/users/[id]/route";
import { GET as getSettingsRoute, PATCH as patchSettings } from "../../src/app/api/settings/route";
import { GET as listNotifications, } from "../../src/app/api/notifications/route";
import { POST as markRead } from "../../src/app/api/notifications/read/route";
import { GET as me } from "../../src/app/api/me/route";
import { prisma } from "../../src/lib/db";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

describe("users API", () => {
  it("lets admins create users and rejects duplicate emails", async () => {
    const admin = await createUser("ADMIN");
    const cookie = await authCookie(admin);
    const body = {
      name: "New Worker",
      email: "new@shiftpay.demo",
      password: "supersecret",
      role: "WORKER",
      hourlyRateCents: 1800,
    };

    const res = await createUserRoute(jsonRequest("/api/users", { cookie, body }));
    expect(res.status).toBe(201);

    const dup = await createUserRoute(jsonRequest("/api/users", { cookie, body }));
    expect(dup.status).toBe(409);
  });

  it("forbids workers from managing users", async () => {
    const worker = await createUser("WORKER");
    const res = await listUsers(
      jsonRequest("/api/users", { method: "GET", cookie: await authCookie(worker) }),
    );
    expect(res.status).toBe(403);
  });

  it("updates role, rate, and active flag", async () => {
    const admin = await createUser("ADMIN");
    const worker = await createUser("WORKER");
    const res = await patchUser(
      jsonRequest(`/api/users/${worker.id}`, {
        method: "PATCH",
        cookie: await authCookie(admin),
        body: { role: "MANAGER", hourlyRateCents: 3000, isActive: false },
      }),
      { params: Promise.resolve({ id: worker.id }) },
    );
    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: worker.id } });
    expect(updated).toMatchObject({ role: "MANAGER", hourlyRateCents: 3000, isActive: false });
  });

  it("prevents admins from deactivating themselves", async () => {
    const admin = await createUser("ADMIN");
    const res = await patchUser(
      jsonRequest(`/api/users/${admin.id}`, {
        method: "PATCH",
        cookie: await authCookie(admin),
        body: { isActive: false },
      }),
      { params: Promise.resolve({ id: admin.id }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("settings API", () => {
  it("updates policy within bounds", async () => {
    const admin = await createUser("ADMIN");
    const res = await patchSettings(
      jsonRequest("/api/settings", {
        method: "PATCH",
        cookie: await authCookie(admin),
        body: { weeklyHourLimit: 45, overtimeMultiplier: 2, currencyCode: "BDT" },
      }),
    );
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.weeklyHourLimit).toBe(45);
    expect(settings.currencyCode).toBe("BDT");
  });

  it("rejects out-of-bounds values", async () => {
    const admin = await createUser("ADMIN");
    const res = await patchSettings(
      jsonRequest("/api/settings", {
        method: "PATCH",
        cookie: await authCookie(admin),
        body: { weeklyHourLimit: 200 },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("forbids non-admins from changing settings but allows reading", async () => {
    const manager = await createUser("MANAGER");
    const cookie = await authCookie(manager);
    const write = await patchSettings(
      jsonRequest("/api/settings", { method: "PATCH", cookie, body: { weeklyHourLimit: 30 } }),
    );
    expect(write.status).toBe(403);
    const read = await getSettingsRoute(jsonRequest("/api/settings", { method: "GET", cookie }));
    expect(read.status).toBe(200);
  });
});

describe("notifications API", () => {
  it("lists own notifications and marks them read", async () => {
    const worker = await createUser("WORKER");
    await prisma.notification.createMany({
      data: [
        { userId: worker.id, type: "T", title: "a", body: "a" },
        { userId: worker.id, type: "T", title: "b", body: "b" },
      ],
    });
    const cookie = await authCookie(worker);

    const res = await listNotifications(
      jsonRequest("/api/notifications", { method: "GET", cookie }),
    );
    const { notifications, unreadCount } = await res.json();
    expect(notifications).toHaveLength(2);
    expect(unreadCount).toBe(2);

    const mark = await markRead(
      jsonRequest("/api/notifications/read", { cookie, body: { all: true } }),
    );
    expect(mark.status).toBe(200);
    const after = await prisma.notification.count({
      where: { userId: worker.id, readAt: null },
    });
    expect(after).toBe(0);
  });
});

describe("GET /api/me", () => {
  it("returns the current user with unread count", async () => {
    const worker = await createUser("WORKER");
    await prisma.notification.create({
      data: { userId: worker.id, type: "T", title: "hi", body: "hi" },
    });
    const res = await me(
      jsonRequest("/api/me", { method: "GET", cookie: await authCookie(worker) }),
    );
    const data = await res.json();
    expect(data.user.id).toBe(worker.id);
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.unreadCount).toBe(1);
  });
});
