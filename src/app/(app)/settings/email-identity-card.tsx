"use client";

import * as React from "react";
import { Loader2Icon, MailIcon } from "lucide-react";
import { toast } from "sonner";

import {
  clearEmailIdentityAction,
  saveEmailIdentityAction,
} from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailIdentityCard({
  activeFrom,
  source,
  saved,
}: {
  activeFrom: string;
  source: "settings" | "env";
  saved: { fromName: string | null; fromEmail: string } | null;
}) {
  const [fromName, setFromName] = React.useState(saved?.fromName ?? "");
  const [fromEmail, setFromEmail] = React.useState(saved?.fromEmail ?? "");
  const [pending, startTransition] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailIcon className="size-4" /> Email sender
        </CardTitle>
        <CardDescription>
          The name and address CRM emails are sent from. Org-wide, admin-only. The address&apos;s
          domain must be verified in your email provider (Resend) or sends will fail.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Currently sending as: </span>
          <Badge variant="secondary" className="font-mono">
            {activeFrom}
          </Badge>{" "}
          <span className="text-muted-foreground text-xs">
            {source === "settings" ? "· from Settings" : "· from .env default"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fromName">From name</Label>
            <Input
              id="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Perx CRM"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fromEmail">From address</Label>
            <Input
              id="fromEmail"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="crm@yourdomain.mv"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={pending || !fromEmail.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await saveEmailIdentityAction({
                  fromName: fromName.trim() || undefined,
                  fromEmail: fromEmail.trim(),
                });
                if (res.error) toast.error(res.error);
                else toast.success("Email sender updated");
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Save
          </Button>
          {saved ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await clearEmailIdentityAction();
                  if (res.error) toast.error(res.error);
                  else {
                    setFromName("");
                    setFromEmail("");
                    toast.success("Reverted to the .env default");
                  }
                })
              }
            >
              Reset to default
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
