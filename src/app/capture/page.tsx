import type { Metadata } from "next";

import { CaptureForm } from "@/app/capture/capture-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveReferralCode } from "@/services/affiliate-portal";

export const metadata: Metadata = { title: "Get started with Perx" };

// Public page — linked from perx.mv marketing and from affiliate referral
// links/QR codes (?ref=CODE), no auth required. Invalid or unapproved codes
// are silently ignored.
export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const affiliate = ref ? await resolveReferralCode(ref) : null;

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-10 items-center justify-center rounded-lg text-lg font-bold">
            P
          </div>
          <CardTitle className="text-xl">Grow repeat customers with Perx</CardTitle>
          <CardDescription>
            Tell us about your business and the Perx team will get back to you within one
            business day.
          </CardDescription>
          {affiliate ? (
            <p className="text-muted-foreground mx-auto mt-1 w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs dark:bg-emerald-950">
              Referred by <span className="font-medium">{affiliate.name}</span>
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <CaptureForm referralCode={affiliate ? (ref ?? null) : null} />
        </CardContent>
      </Card>
    </div>
  );
}
