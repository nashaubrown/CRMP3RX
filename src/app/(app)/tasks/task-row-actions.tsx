"use client";

import * as React from "react";
import { toast } from "sonner";

import { toggleActivityCompleteAction } from "@/app/(app)/_actions/activities";
import { Checkbox } from "@/components/ui/checkbox";

export function TaskCompleteToggle({ taskId, completed }: { taskId: string; completed: boolean }) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Checkbox
      checked={completed}
      disabled={pending}
      aria-label={completed ? "Reopen task" : "Complete task"}
      onCheckedChange={() =>
        startTransition(async () => {
          await toggleActivityCompleteAction(taskId, "/tasks");
          toast.success(completed ? "Task reopened" : "Task completed");
        })
      }
    />
  );
}
