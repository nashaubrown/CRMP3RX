"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, MessageCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { logWhatsappProposalAction } from "@/app/(app)/deals/actions";
import { Button } from "@/components/ui/button";

// One-tap: mark that the proposal was sent to the merchant over WhatsApp.
// Advances the deal to Proposal (from an earlier stage) and logs the activity.
export function WhatsappProposalButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await logWhatsappProposalAction(dealId);
          if (res.error) toast.error(res.error);
          else {
            toast.success("Logged — proposal marked sent on WhatsApp");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <MessageCircleIcon />}
      Log WhatsApp proposal
    </Button>
  );
}
