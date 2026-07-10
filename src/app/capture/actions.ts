"use server";

import { headers } from "next/headers";

import { rateLimit } from "@/lib/rate-limit";
import { leadCaptureSchema } from "@/lib/validators/lead";
import { captureLead } from "@/services/leads";

export type CaptureState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

export async function captureLeadAction(
  _prev: CaptureState,
  formData: FormData
): Promise<CaptureState> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  // 5 submissions per 10 minutes per IP
  if (!rateLimit(`capture:${ip}`, 5, 10 * 60 * 1000)) {
    return { error: "Too many submissions — please try again in a few minutes." };
  }

  const parsed = leadCaptureSchema.safeParse({
    name: formData.get("name") ?? undefined,
    company: formData.get("company") ?? undefined,
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    message: formData.get("message") ?? undefined,
    website: formData.get("website") ?? "", // honeypot
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields", fieldErrors };
  }

  // Honeypot filled → pretend success, log nothing
  if (formData.get("website")) {
    return { error: null, success: true };
  }

  await captureLead(parsed.data);
  return { error: null, success: true };
}
