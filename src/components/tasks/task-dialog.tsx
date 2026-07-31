"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { createTaskAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";

export type UiTask = {
  id: string;
  title: string;
  notes: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  done: boolean;
  assigneeId: string;
  assigneeName: string;
  link: { kind: "merchant" | "contact" | "deal"; href: string; label: string } | null;
  merchantId: string | null;
  contactId: string | null;
  dealId: string | null;
  dueAtLocal: string | null; // datetime-local value (Maldives wall clock)
  dueLabel: string | null;
  overdue: boolean;
  bucket: "overdue" | "today" | "week" | "later" | "none" | "done";
};

const NONE = "__none__";

type DialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: UiTask | null;
  team: { id: string; name: string }[];
  merchants: { id: string; name: string }[];
  defaultAssigneeId: string;
  revalidate?: string;
  lockLink?: boolean;
  presetLink?: { merchantId?: string; contactId?: string; dealId?: string };
};

export function TaskDialog(props: DialogProps) {
  const { open, onOpenChange, task } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update this task." : "Add a task to the tracker — standalone or linked to a record."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open / target change so fields seed from props without an effect. */}
        {open ? <TaskForm key={task?.id ?? "new"} {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  onOpenChange,
  task,
  team,
  merchants,
  defaultAssigneeId,
  revalidate = "/tasks",
  lockLink = false,
  presetLink,
}: DialogProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [notes, setNotes] = React.useState(task?.notes ?? "");
  const [priority, setPriority] = React.useState(task?.priority ?? "MEDIUM");
  const [status, setStatus] = React.useState(task?.status ?? "TODO");
  const [dueAt, setDueAt] = React.useState(task?.dueAtLocal ?? "");
  const [assigneeId, setAssigneeId] = React.useState(task?.assigneeId ?? defaultAssigneeId);
  const [merchantId, setMerchantId] = React.useState<string>(task?.merchantId ?? NONE);

  const carriedContactId = task?.contactId ?? undefined;
  const carriedDealId = task?.dealId ?? undefined;

  function submit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    // Record-scoped dialogs keep the record link fixed; the tracker dialog lets
    // you pick a merchant.
    const linkFields = lockLink
      ? task
        ? {
            merchantId: task.merchantId ?? undefined,
            contactId: task.contactId ?? undefined,
            dealId: task.dealId ?? undefined,
          }
        : {
            merchantId: presetLink?.merchantId,
            contactId: presetLink?.contactId,
            dealId: presetLink?.dealId,
          }
      : {
          merchantId: merchantId === NONE ? undefined : merchantId,
          contactId: carriedContactId,
          dealId: carriedDealId,
        };
    const input = { title, notes, priority, status, dueAt, assigneeId, ...linkFields };
    startTransition(async () => {
      const res = task
        ? await updateTaskAction(task.id, input, revalidate)
        : await createTaskAction(input, revalidate);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(task ? "Task updated" : "Task created");
      onOpenChange(false);
      router.refresh();
    });
  }

  const showMerchantLink = !lockLink && !carriedContactId && !carriedDealId;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-title">Title *</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Follow up on proposal"
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as UiTask["priority"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as UiTask["status"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODO">To do</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-due">Due (Maldives time)</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Assignee</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {showMerchantLink ? (
          <div className="flex flex-col gap-1.5">
            <Label>Link to merchant (optional)</Label>
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : task?.link ? (
          <p className="text-muted-foreground text-xs">Linked to {task.link.label}</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-notes">Notes</Label>
          <Textarea
            id="task-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional details"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {task ? "Save" : "Create task"}
        </Button>
      </DialogFooter>
    </>
  );
}
