import type { Affiliate } from "@prisma/client";
import type { ZodError } from "zod";

import { apiError, apiJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { AffiliatePortalError, requireAffiliate } from "@/services/affiliate-portal";

// Shared plumbing for the affiliate portal API (/api/affiliate/*). The portal
// app calls these endpoints server-side with a bearer session token; the
// public registration/auth endpoints are unauthenticated but rate-limited.

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function tooMany(): Response {
  return apiError(429, "Too many requests — please try again in a few minutes.");
}

// Auth + registration endpoints: 5 requests / 15 min per IP and per email.
export function authRateLimited(req: Request, bucket: string, email?: string): boolean {
  const ipOk = rateLimit(`aff:${bucket}:ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
  const emailOk = email
    ? rateLimit(`aff:${bucket}:email:${email.toLowerCase()}`, 5, 15 * 60 * 1000)
    : true;
  return !(ipOk && emailOk);
}

export function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

export function handlePortalError(e: unknown): Response {
  if (e instanceof AffiliatePortalError) return apiError(e.status, e.message);
  console.error("[affiliate-api]", e);
  return apiError(500, "Something went wrong. Please try again.");
}

// Bearer guard: runs the handler with the session's affiliate, or 401s.
// Every data query downstream is scoped by this affiliate's id — portal
// routes carry no id parameters by construction.
export async function withAffiliate(
  req: Request,
  handler: (affiliate: Affiliate) => Promise<Response>
): Promise<Response> {
  const affiliate = await requireAffiliate(req);
  if (!affiliate) {
    return apiError(401, "Your session has expired. Please sign in again.");
  }
  try {
    return await handler(affiliate);
  } catch (e) {
    return handlePortalError(e);
  }
}

export { apiError, apiJson };
