"use client";

import * as React from "react";
import { CheckIcon, MoreHorizontalIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { toast } from "sonner";

import {
  deleteActivityAction,
  toggleActivityCompleteAction,
} from "@/app/(app)/_actions/activities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ActivityItemActions({
  activityId,
  isTask,
  completed,
  revalidatePath,
}: {
  activityId: string;
  isTask: boolean;
  completed: boolean;
  revalidatePath: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 opacity-60 group-hover:opacity-100"
          disabled={pending}
          aria-label="Activity actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isTask ? (
          <DropdownMenuItem
            onClick={() =>
              startTransition(async () => {
                await toggleActivityCompleteAction(activityId, revalidatePath);
              })
            }
          >
            {completed ? <UndoIcon /> : <CheckIcon />}
            {completed ? "Reopen" : "Mark complete"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            startTransition(async () => {
              await deleteActivityAction(activityId, revalidatePath);
              toast.success("Activity deleted");
            })
          }
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
