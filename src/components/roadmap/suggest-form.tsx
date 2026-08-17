"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { suggestRoadmapItemAction } from "@/app/(app)/roadmap/actions";
import { PRODUCT_LABELS } from "@/components/dev/ticket-bits";
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

export function SuggestForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [product, setProduct] = React.useState("MERCHANT_PORTAL");

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await suggestRoadmapItemAction({
        title: formData.get("title"),
        description: formData.get("description"),
        product,
      });
      if (res.error || !res.id) {
        toast.error(res.error ?? "Couldn't save the idea");
        return;
      }
      toast.success("Idea on the roadmap — your vote's already on it");
      router.push(`/roadmap/${res.id}`);
    });
  }

  return (
    <form action={submit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="r-title">The idea</Label>
        <Input
          id="r-title"
          name="title"
          required
          placeholder="e.g. Let merchants schedule rewards to start on a date"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="r-desc">Why it matters (optional)</Label>
        <Textarea
          id="r-desc"
          name="description"
          rows={4}
          placeholder="Who asked, what problem it solves, what they said…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Product</Label>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger className="w-56">
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Add to roadmap
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
