"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { setUiModeAction } from "@/app/(app)/_actions/canvas";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Topbar switch: Classic <-> Generative. Persists the per-user preference and
// takes the user to their new home.
export function UiModeToggle({ generative }: { generative: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(generative);
  const [pending, start] = React.useTransition();

  function toggle(next: boolean) {
    setOn(next);
    start(async () => {
      await setUiModeAction(next);
      toast.success(next ? "Generative UI on" : "Classic UI on");
      // Note: no router.refresh() here — it would abort the push navigation.
      router.push(next ? "/canvas" : "/dashboard");
    });
  }

  return (
    <div className="hidden items-center gap-2 sm:flex" title="Switch between the classic app and the AI-composed canvas">
      <WandSparklesIcon
        className={on ? "text-primary size-4" : "text-muted-foreground size-4"}
      />
      <Label htmlFor="ui-mode" className="text-muted-foreground cursor-pointer text-xs">
        Generative
      </Label>
      <Switch id="ui-mode" checked={on} onCheckedChange={toggle} disabled={pending} />
    </div>
  );
}
