import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./playlists";
import { ProviderError } from "../providers/types";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Wrap a route handler with uniform error handling. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) return json({ error: "Invalid request", issues: e.issues.slice(0, 5) }, { status: 400 });
      if (e instanceof ProviderError) return json({ error: e.message, provider: e.provider }, { status: e.status && e.status < 500 ? e.status : 502 });
      console.error("[api]", e);
      return json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* empty body */ }
  return schema.parse(raw);
}
