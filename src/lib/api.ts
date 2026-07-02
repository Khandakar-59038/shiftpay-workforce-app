import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Wrap a route handler with the shared error envelope. */
export function handle<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, ...(err.fields ? { fields: err.fields } : {}) },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of err.issues) {
          fields[issue.path.join(".") || "_"] = issue.message;
        }
        return NextResponse.json(
          { error: "Validation failed", fields },
          { status: 400 },
        );
      }
      console.error("Unhandled API error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  return schema.parse(raw);
}
