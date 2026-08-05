"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveApplicationAction,
  rejectApplicationAction,
} from "@/app/(app)/affiliates/portal-actions";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ApplicationRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  idCardNumber: string | null;
  idDocumentUrl: string | null; // /api/affiliate-files/… (admin session gated)
  idDocumentIsPdf: boolean;
  signatureUrl: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  tcVersion: string | null;
  appliedAtLabel: string;
  priorRejection: { reviewedAtLabel: string | null; reviewNote: string | null } | null;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}

function ApplicationCard({ app }: { app: ApplicationRow }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [decision, setDecision] = React.useState<"approve" | "reject" | null>(null);
  const [rate, setRate] = React.useState("");
  const [schedule, setSchedule] = React.useState("MONTHLY");
  const [note, setNote] = React.useState("");

  function approve() {
    startTransition(async () => {
      const res = await approveApplicationAction(app.id, {
        commissionRate: rate,
        payoutSchedule: schedule,
      });
      if (res.error) toast.error(res.error);
      else toast.success(`Approved ${app.name} — welcome email sent`);
    });
  }

  function reject() {
    startTransition(async () => {
      const res = await rejectApplicationAction(app.id, note);
      if (res.error) toast.error(res.error);
      else toast.success(`Rejected ${app.name}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{app.name}</span>
            {app.priorRejection ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                Re-applicant
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {[app.email, app.phone].filter(Boolean).join(" · ")} · applied {app.appliedAtLabel}
          </p>
        </div>
        {open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ID card number" value={app.idCardNumber} />
            <Field label="Bank" value={app.bankName} />
            <Field
              label="Account"
              value={
                app.bankAccountLast4
                  ? `${app.bankAccountName ?? ""} · •••• ${app.bankAccountLast4}`
                  : null
              }
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Check that the typed name and ID number match the uploaded document, and that the
            account holder name matches the ID name.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">ID document</span>
              {app.idDocumentUrl ? (
                app.idDocumentIsPdf ? (
                  <iframe
                    src={app.idDocumentUrl}
                    className="h-64 w-full rounded-md border"
                    title="ID document"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.idDocumentUrl}
                    alt="ID document"
                    className="max-h-64 w-fit rounded-md border object-contain"
                  />
                )
              ) : (
                <span className="text-muted-foreground text-sm">Missing</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">
                Signature (Terms v{app.tcVersion ?? "?"})
              </span>
              {app.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={app.signatureUrl}
                  alt="Drawn signature"
                  className="max-h-32 w-fit rounded-md border bg-white object-contain p-2"
                />
              ) : (
                <span className="text-muted-foreground text-sm">Missing</span>
              )}
            </div>
          </div>

          {app.priorRejection ? (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
              Previously rejected{app.priorRejection.reviewedAtLabel ? ` on ${app.priorRejection.reviewedAtLabel}` : ""}
              {app.priorRejection.reviewNote ? ` — “${app.priorRejection.reviewNote}”` : ""}.
            </p>
          ) : null}

          {decision === "approve" ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Commission rate (% of MRR) *</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={100}
                    step="0.5"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 10"
                    className="h-8"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Payout schedule</Label>
                  <Select value={schedule} onValueChange={setSchedule}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDecision(null)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={approve} disabled={pending || !rate}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}
                  Approve &amp; send welcome email
                </Button>
              </div>
            </div>
          ) : decision === "reject" ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Reason (optional — included in the decline email)</Label>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. The ID document was unreadable"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDecision(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={reject}
                  disabled={pending}
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : <XCircleIcon />}
                  Reject application
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDecision("reject")}>
                <XCircleIcon /> Reject
              </Button>
              <Button type="button" size="sm" onClick={() => setDecision("approve")}>
                <CheckCircle2Icon /> Approve…
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Pending self-registrations awaiting an admin decision. The ID document and
// signature render straight from the admin-gated file route.
export function ApplicationsReview({ applications }: { applications: ApplicationRow[] }) {
  if (applications.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Applications
          <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
            {applications.length} pending
          </Badge>
        </CardTitle>
        <CardDescription>
          Self-registered applicants from the affiliate portal. Approving sets the commission rate
          and payout schedule and emails them their referral code.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {applications.map((a) => (
          <ApplicationCard key={a.id} app={a} />
        ))}
      </CardContent>
    </Card>
  );
}
