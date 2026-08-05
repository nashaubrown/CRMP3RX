"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { saveTermsAction } from "@/app/(app)/affiliates/portal-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Singleton editor for the affiliate Terms & Conditions (HTML body + version
// string). Bumping the version forces every affiliate to re-accept — with a
// fresh signature — on their next portal sign-in.
export function TermsEditor({
  initialVersion,
  initialBodyHtml,
}: {
  initialVersion: string;
  initialBodyHtml: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [version, setVersion] = React.useState(initialVersion);
  const [bodyHtml, setBodyHtml] = React.useState(initialBodyHtml);
  const versionChanged = initialVersion !== "" && version !== initialVersion;

  function save() {
    startTransition(async () => {
      const res = await saveTermsAction({ version, bodyHtml });
      if (res.error) toast.error(res.error);
      else toast.success("Terms published");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affiliate Terms &amp; Conditions</CardTitle>
        <CardDescription>
          Shown (and signed) during registration and at{" "}
          <span className="font-mono text-xs">/terms</span> on the portal. Changing the version
          forces every affiliate to re-accept with a fresh signature on their next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label className="text-xs">Version</Label>
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. 2026-08-01"
            className="h-8"
          />
          {versionChanged ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Publishing a new version will require every affiliate to re-sign.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Terms text (HTML)</Label>
          <Textarea
            rows={10}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            placeholder="<h2>Perx Affiliate Terms &amp; Conditions</h2>…"
            className="font-mono text-xs"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={save} disabled={pending || !version || !bodyHtml}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Publish
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
