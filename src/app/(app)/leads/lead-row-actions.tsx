"use client";

import * as React from "react";
import { HandIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { claimLeadAction } from "@/app/(app)/leads/actions";
import { ConvertLeadButton } from "@/app/(app)/leads/[id]/lead-actions";
import { Button } from "@/components/ui/button";

// Row actions on the leads list. Previously the list had none at all: every
// action lived on the lead's own page, reachable only by clicking its name,
// which read as plain text — so the page looked like it did nothing.
//
// z-10 + relative keeps these above the row's stretched link (see the table),
// so clicking a button doesn't also navigate.
export function LeadRowActions({
  leadId,
  canClaim,
  company,
  converted,
}: {
  leadId: string;
  canClaim: boolean;
  company: string | null;
  converted: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="relative z-10 flex justify-end gap-1.5">
      {canClaim ? (
        <Button
          size="sm"
          variant="outline"
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
      ) : null}

      {converted ? null : (
        <ConvertLeadButton leadId={leadId} company={company} label="Convert" />
      )}
    </div>
  );
}
