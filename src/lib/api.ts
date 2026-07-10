import type { SessionUser } from "@/lib/authz";
import { authenticateRequest } from "@/services/api-keys";

// Shared plumbing for the public REST API (/api/v1/*).

export function apiJson(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export const UNAUTHORIZED = () =>
  apiError(
    401,
    "Missing or invalid API key. Create one in Settings and send it as 'Authorization: Bearer perx_…'."
  );

export async function requireApiUser(req: Request): Promise<SessionUser | Response> {
  const user = await authenticateRequest(req);
  return user ?? UNAUTHORIZED();
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

// Parse a JSON body, tolerating an empty or malformed payload.
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
