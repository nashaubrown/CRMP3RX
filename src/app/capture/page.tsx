import type { Metadata } from "next";

import { CaptureForm } from "@/app/capture/capture-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Get started with Perx" };

// Public page — linked from perx.mv marketing, no auth required.
export default function CapturePage() {
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
        </CardHeader>
        <CardContent>
          <CaptureForm />
        </CardContent>
      </Card>
    </div>
  );
}
