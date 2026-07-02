import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ApiError } from "./api";

export const SESSION_COOKIE = "shiftpay_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Role = "WORKER" | "MANAGER" | "ADMIN";

export interface Session {
  userId: string;
  role: string;
  name: string;
  email: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function sessionToken(session: Session): Promise<string> {
  return new SignJWT({ role: session.role, name: session.name, email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      role: String(payload.role),
      name: String(payload.name),
      email: String(payload.email),
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Read the session from an incoming Request's Cookie header (API routes). */
export async function getSessionFromRequest(req: Request): Promise<Session | null> {
  const header = req.headers.get("cookie") ?? "";
  const match = header
    .split(/;\s*/)
    .map((part) => part.split("="))
    .find(([name]) => name === SESSION_COOKIE);
  if (!match) return null;
  return readSessionToken(match.slice(1).join("="));
}

/** Read the session inside server components / pages. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function requireUser(req: Request): Promise<Session> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new ApiError(401, "Not signed in");
  return session;
}

export async function requireRole(req: Request, ...roles: Role[]): Promise<Session> {
  const session = await requireUser(req);
  if (!roles.includes(session.role as Role)) {
    throw new ApiError(403, "You do not have permission to do that");
  }
  return session;
}
