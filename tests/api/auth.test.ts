import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "../../src/app/api/auth/login/route";
import { requireRole } from "../../src/lib/auth";
import { ApiError } from "../../src/lib/api";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

describe("POST /api/auth/login", () => {
  it("rejects wrong password with 401", async () => {
    const user = await createUser("WORKER");
    const res = await login(
      jsonRequest("/api/auth/login", { body: { email: user.email, password: "wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects deactivated accounts", async () => {
    const user = await createUser("WORKER", { isActive: false });
    const res = await login(
      jsonRequest("/api/auth/login", { body: { email: user.email, password: "demo1234" } }),
    );
    expect(res.status).toBe(403);
  });

  it("sets a session cookie on success", async () => {
    const user = await createUser("WORKER");
    const res = await login(
      jsonRequest("/api/auth/login", { body: { email: user.email, password: "demo1234" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("shiftpay_session=");
    const body = await res.json();
    expect(body.user.role).toBe("WORKER");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("validates the payload", async () => {
    const res = await login(jsonRequest("/api/auth/login", { body: { email: "not-an-email" } }));
    expect(res.status).toBe(400);
  });
});

describe("requireRole", () => {
  it("throws 401 without a session", async () => {
    const req = jsonRequest("/api/anything", { method: "GET" });
    await expect(requireRole(req, "MANAGER")).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 for the wrong role", async () => {
    const worker = await createUser("WORKER");
    const req = jsonRequest("/api/anything", {
      method: "GET",
      cookie: await authCookie(worker),
    });
    const err = await requireRole(req, "MANAGER").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
  });

  it("returns the session for an allowed role", async () => {
    const manager = await createUser("MANAGER");
    const req = jsonRequest("/api/anything", {
      method: "GET",
      cookie: await authCookie(manager),
    });
    const session = await requireRole(req, "MANAGER", "ADMIN");
    expect(session.userId).toBe(manager.id);
  });
});
