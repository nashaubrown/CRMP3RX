"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  addDevAttachmentAction,
  createDevTicketAction,
} from "@/app/(app)/dev/actions";
import { PRODUCT_LABELS, TYPE_LABELS, PRIORITY_LABELS } from "@/components/dev/ticket-bits";
import { Button } from "@/components/ui/button";
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

const NONE = "__none__";

export type PersonOption = { id: string; name: string; role: string };
export type MerchantOption = { id: string; name: string };

export function NewTicketForm({
  people,
  merchants,
}: {
  people: PersonOption[];
  merchants: MerchantOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [type, setType] = React.useState("BUG");
  const [product, setProduct] = React.useState("MERCHANT_PORTAL");
  const [priority, setPriority] = React.useState("MEDIUM");
  const [assigneeId, setAssigneeId] = React.useState(NONE);
  const [merchantId, setMerchantId] = React.useState(NONE);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Developers first in the assignee list — they're who tickets go to.
  const sorted = [...people].sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name) : a.role === "DEVELOPER" ? -1 : 1
  );

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createDevTicketAction({
        title: formData.get("title"),
        description: formData.get("description"),
        type,
        product,
        priority,
        assigneeId: assigneeId === NONE ? "" : assigneeId,
        merchantId: merchantId === NONE ? "" : merchantId,
      });
      if (res.error || !res.id) {
        toast.error(res.error ?? "Couldn't file the ticket");
        return;
      }
      // Screenshots ride along after the ticket exists.
      const files = fileRef.current?.files;
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.set("file", file);
          const up = await addDevAttachmentAction(res.id, fd);
          if (up.error) toast.error(`${file.name}: ${up.error}`);
        }
      }
      toast.success("Ticket filed");
      router.push(`/dev/${res.id}`);
    });
  }

  return (
    <form action={submit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="t-title">Title</Label>
        <Input
          id="t-title"
          name="title"
          required
          placeholder="e.g. Merchant Portal: reward image upload fails on iOS Safari"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="t-desc">What happens, and how to reproduce it</Label>
        <Textarea
          id="t-desc"
          name="description"
          rows={5}
          placeholder={
            "1. Open …\n2. Tap …\nExpected: …\nActual: …\nDevice/browser if it matters."
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Product</Label>
          <Select value={product} onValueChange={setProduct}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRODUCT_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Assign to</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned (devs triage)</SelectItem>
              {sorted.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.role === "DEVELOPER" ? " · dev" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Reported by merchant (optional)</Label>
          <Select value={merchantId} onValueChange={setMerchantId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No merchant</SelectItem>
              {merchants.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="t-files">Screenshots (PNG/JPG/WebP/GIF/PDF, up to 5 MB each)</Label>
        <Input id="t-files" ref={fileRef} type="file" multiple accept="image/*,application/pdf" />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          File ticket
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
