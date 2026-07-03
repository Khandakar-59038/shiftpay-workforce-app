import { prisma } from "../../src/lib/db";
import { hashPassword, sessionToken, SESSION_COOKIE } from "../../src/lib/auth";

/** Delete every row, children before parents. */
export async function resetDb() {
  await prisma.message.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.timeAdjustment.deleteMany();
  await prisma.scheduleDay.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.companySettings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.companySettings.create({ data: { id: 1 } });
}

let emailCounter = 0;

export async function createUser(
  role: "WORKER" | "MANAGER" | "ADMIN",
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    hourlyRateCents: number;
    isActive: boolean;
  }> = {},
) {
  emailCounter += 1;
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Test ${role} ${emailCounter}`,
      email: overrides.email ?? `${role.toLowerCase()}${emailCounter}@test.local`,
      passwordHash: await hashPassword(overrides.password ?? "demo1234"),
      role,
      hourlyRateCents: overrides.hourlyRateCents ?? 2000,
      isActive: overrides.isActive ?? true,
    },
  });
}

/** Build a Cookie header value for an authenticated request. */
export async function authCookie(user: {
  id: string;
  role: string;
  name: string;
  email: string;
}) {
  const token = await sessionToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  return `${SESSION_COOKIE}=${token}`;
}

export function jsonRequest(
  url: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {},
) {
  return new Request(`http://localhost${url}`, {
    method: opts.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
