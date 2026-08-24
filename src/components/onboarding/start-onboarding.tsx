"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { startOnboardingAction } from "@/app/(app)/onboarding/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StartOption = { id: string; name: string; plan: string | null };
export type PlaybookOption = { id: string; name: string; taskCount: number };

// Starting an onboarding by hand. The common path is automatic — winning a
// deal creates the project — so this exists for merchants that arrived some
// other way, and for a merchant whose deal predates the feature.
export function StartOnboardingDialog({
  merchants,
  playbooks,
}: {
  merchants: StartOption[];
  playbooks: PlaybookOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [merchantId, setMerchantId] = React.useState<string>("");
  const [playbookId, setPlaybookId] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    formData.set("merchantId", merchantId);
    formData.set("playbookId", playbookId);
    startTransition(async () => {
      const res = await startOnboardingAction(formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("Onboarding started");
      if (res.id) router.push(`/onboarding/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" /> Start onboarding
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Start onboarding</DialogTitle>
            <DialogDescription>
              The checklist comes from a playbook — matched to the merchant&apos;s plan unless you
              pick another. Every step stays editable afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-merchant">Merchant</Label>
              {merchants.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Every merchant already has an onboarding project.
                </p>
              ) : (
                <Select value={merchantId} onValueChange={setMerchantId}>
                  <SelectTrigger id="ob-merchant">
                    <SelectValue placeholder="Pick a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        {m.plan ? ` · ${m.plan}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-playbook">Playbook</Label>
              <Select value={playbookId} onValueChange={setPlaybookId}>
                <SelectTrigger id="ob-playbook">
                  <SelectValue placeholder="Match the merchant's plan" />
                </SelectTrigger>
                <SelectContent>
                  {playbooks.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.taskCount} steps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-target">Target go-live date</Label>
              <Input id="ob-target" name="targetLiveDate" type="date" />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !merchantId}>
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
