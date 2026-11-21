import type { ZodTypeAny, z } from "zod";

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 429, message: string, public code?: string) { super(message); }
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Invalid request");
  return r.data;
}
