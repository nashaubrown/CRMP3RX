"use client";

import * as React from "react";
import type { LeadStatus } from "@prisma/client";
import { ArrowRightIcon, HandIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  claimLeadAction,
  convertLeadAction,
  setLeadStatusAction,
} from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Select
      value={status}
      onValueChange={(next) =>
        startTransition(async () => {
          await setLeadStatusAction(leadId, next as LeadStatus);
          toast.success("Status updated");
        })
      }
      disabled={pending}
    >
      <SelectTrigger className="w-40" aria-label="Lead status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NEW">New</SelectItem>
        <SelectItem value="CONTACTED">Contacted</SelectItem>
        <SelectItem value="QUALIFIED">Qualified</SelectItem>
        <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ClaimLeadButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await claimLeadAction(leadId);
          toast.success("Lead assigned to you");
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <HandIcon />}
      Assign to me
    </Button>
  );
}

export function ConvertLeadButton({
  leadId,
  company,
  size = "sm",
  label = "Convert to merchant",
}: {
  leadId: string;
  // Null/empty means the lead has no company name yet. The button stays
  // visible and explains itself — hiding it just looked like the feature was
  // missing.
  company: string | null;
  size?: "sm" | "icon";
  label?: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  if (!company) {
    return (
      <Button
        size={size}
        variant="outline"
        disabled
        title="This lead has no company name yet — add one, then convert."
      >
        <ArrowRightIcon /> {label}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline">
          <ArrowRightIcon /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert this lead?</DialogTitle>
          <DialogDescription>
            Creates a new merchant &ldquo;{company}&rdquo; with a primary contact from the
            lead&apos;s details, owned by you, and marks the lead qualified.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await convertLeadAction(leadId);
                } catch (e) {
                  // redirect() throws on success; surface real errors only
                  if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) {
                    toast.error(e.message);
                    return;
                  }
                  throw e;
                }
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
