"use client";

import * as React from "react";
import { useActionState } from "react";
import type { EntityType } from "@prisma/client";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createActivityAction, type ActivityFormState } from "@/app/(app)/_actions/activities";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const initialState: ActivityFormState = { error: null };

const TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "TASK", label: "Task" },
  { value: "MEETING", label: "Meeting" },
];

export function AddActivityForm({
  entityType,
  entityId,
  revalidatePath,
}: {
  entityType: EntityType;
  entityId: string;
  revalidatePath: string;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [type, setType] = React.useState("NOTE");
  const [state, formAction, pending] = useActionState(
    async (prev: ActivityFormState, formData: FormData) => {
      const result = await createActivityAction(prev, formData);
      if (result.success) {
        formRef.current?.reset();
        setType("NOTE");
        toast.success("Activity added");
      }
      return result;
    },
    initialState
  );

  const needsDueDate = type === "TASK" || type === "MEETING";

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="revalidate" value={revalidatePath} />
      <input type="hidden" name="type" value={type} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-32" aria-label="Activity type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="subject" placeholder="Subject" required className="flex-1" />
      </div>

      <Textarea name="body" placeholder="Details (optional)" rows={2} />

      {needsDueDate ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dueAt" className="text-muted-foreground text-xs">
            Due (Maldives time)
          </Label>
          <Input id="dueAt" name="dueAt" type="datetime-local" className="sm:w-56" />
        </div>
      ) : null}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add
        </Button>
      </div>
    </form>
  );
}
