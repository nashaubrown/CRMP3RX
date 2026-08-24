"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  SkipForwardIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addStepAction,
  advanceStageAction,
  removeStepAction,
  setBlockedAction,
  toggleTaskAction,
} from "@/app/(app)/onboarding/actions";
import { Initials, StageDot } from "@/components/onboarding/onboarding-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/datetime";
import { OWNER_ROLE_LABELS, STAGE_LABELS } from "@/lib/onboarding-stages";
import { cn } from "@/lib/utils";

export type DetailTask = {
  id: string;
  stage: string;
  title: string;
  description: string | null;
  ownerRole: "REP" | "DEVELOPER" | "MERCHANT";
  source: "PLAYBOOK" | "CUSTOM";
  assigneeName: string | null;
  dueAt: string | null;
  doneAt: string | null;
  devTicketNumber: number | null;
  devTicketId: string | null;
};

export type DetailStage = {
  stage: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED";
  enteredAt: string | null;
  completedAt: string | null;
  skipReason: string | null;
  tasks: DetailTask[];
};

// One stage's checklist. The current stage is open; finished and future ones
// collapse, because a launch has 28 steps and only ~5 of them are live at once.
export function StageSection({
  projectId,
  stage,
  current,
  editable,
}: {
  projectId: string;
  stage: DetailStage;
  current: boolean;
  editable: boolean;
}) {
  const [open, setOpen] = React.useState(current);
  const done = stage.tasks.filter((t) => t.doneAt).length;

  return (
    <section className="bg-card surface-card overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center gap-2.5 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <StageDot stage={stage.stage as never} />
        <span className="text-sm font-semibold">{STAGE_LABELS[stage.stage as never]}</span>
        {current ? (
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
            Current stage
          </span>
        ) : stage.status === "SKIPPED" ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
            Skipped
          </span>
        ) : stage.status === "DONE" ? (
          <span className="text-primary text-[11px] font-semibold">Complete</span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-[11px] font-semibold">
          {done} of {stage.tasks.length} done
        </span>
      </button>

      {stage.skipReason ? (
        <p className="text-muted-foreground border-t px-4 py-2 text-xs">
          Skipped — {stage.skipReason}
        </p>
      ) : null}

      {open ? (
        <div className="border-t">
          {stage.tasks.length === 0 ? (
            <p className="text-muted-foreground px-4 py-3 text-sm">No steps in this stage.</p>
          ) : (
            stage.tasks.map((task) => (
              <TaskRow
                key={task.id}
                projectId={projectId}
                task={task}
                editable={editable}
              />
            ))
          )}
          {editable ? <AddStep projectId={projectId} stage={stage.stage} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function TaskRow({
  projectId,
  task,
  editable,
}: {
  projectId: string;
  task: DetailTask;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const done = Boolean(task.doneAt);
  const overdue = !done && task.dueAt && new Date(task.dueAt) < new Date();

  function toggle() {
    startTransition(async () => {
      const res = await toggleTaskAction(task.id, !done);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeStepAction(projectId, task.id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0",
        pending && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!editable || pending}
        aria-pressed={done}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors",
          done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
        )}
      >
        {done ? <CheckIcon className="size-3" /> : null}
      </button>

      <span className="min-w-0 flex-1">
        <span className={cn("block", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        {task.description ? (
          <span className="text-muted-foreground block text-xs">{task.description}</span>
        ) : null}
        {task.devTicketNumber ? (
          <Link
            href={`/dev/${task.devTicketId}`}
            className="text-primary text-xs hover:underline"
          >
            PERX-{task.devTicketNumber}
          </Link>
        ) : null}
      </span>

      {task.ownerRole !== "REP" ? (
        <span className="bg-muted text-muted-foreground hidden rounded px-1.5 py-0.5 text-[10.5px] font-semibold sm:inline">
          {OWNER_ROLE_LABELS[task.ownerRole]}
        </span>
      ) : null}
      {task.assigneeName ? <Initials name={task.assigneeName} /> : null}

      <span
        className={cn(
          "w-24 shrink-0 text-right text-[11px] font-semibold",
          overdue ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {done
          ? `done ${formatDate(task.doneAt!, "d MMM")}`
          : task.dueAt
            ? `${overdue ? "overdue" : "due"} ${formatDate(task.dueAt, "d MMM")}`
            : "—"}
      </span>

      {editable && task.source === "CUSTOM" ? (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${task.title}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// Adding a step here changes this merchant's launch only — the playbook is
// untouched, which is what makes the template usable in the real world.
function AddStep({ projectId, stage }: { projectId: string; stage: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [role, setRole] = React.useState("REP");
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    formData.set("stage", stage);
    formData.set("ownerRole", role);
    startTransition(async () => {
      const res = await addStepAction(projectId, formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <Input
        name="title"
        placeholder="Add a step for this merchant only…"
        className="h-8 min-w-48 flex-1 text-sm"
        required
      />
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="REP">Perx rep</SelectItem>
          <SelectItem value="DEVELOPER">Developer</SelectItem>
          <SelectItem value="MERCHANT">Merchant</SelectItem>
        </SelectContent>
      </Select>
      <Input name="dueAt" type="date" className="h-8 w-36 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
        Add
      </Button>
    </form>
  );
}

// Advance / skip / block, the three things that move a launch.
export function StageActions({
  projectId,
  currentStage,
  openSteps,
  blockedReason,
}: {
  projectId: string;
  currentStage: string;
  openSteps: number;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [skipping, setSkipping] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        setSkipping(false);
        setBlocking(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => advanceStageAction(projectId),
              `${STAGE_LABELS[currentStage as never]} complete`
            )
          }
        >
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Advance stage
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSkipping((v) => !v)}>
          <SkipForwardIcon className="size-4" /> Skip
        </Button>
        <Button
          size="sm"
          variant={blockedReason ? "default" : "outline"}
          onClick={() => {
            if (blockedReason) run(() => setBlockedAction(projectId, null), "Unblocked");
            else setBlocking((v) => !v);
          }}
        >
          <AlertTriangleIcon className="size-4" />
          {blockedReason ? "Unblock" : "Mark blocked"}
        </Button>
      </div>

      {openSteps > 0 ? (
        <p className="text-muted-foreground text-xs">
          {openSteps} step{openSteps === 1 ? "" : "s"} still open in this stage — advancing leaves
          them behind, where they stay visible.
        </p>
      ) : null}

      {skipping ? (
        <form
          className="flex flex-wrap gap-2"
          action={(fd) =>
            run(
              () => advanceStageAction(projectId, String(fd.get("reason") ?? "")),
              "Stage skipped"
            )
          }
        >
          <Input
            name="reason"
            required
            placeholder="Why is this stage being skipped?"
            className="h-8 min-w-56 flex-1 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Skip stage
          </Button>
        </form>
      ) : null}

      {blocking ? (
        <form
          className="flex flex-wrap gap-2"
          action={(fd) =>
            run(() => setBlockedAction(projectId, String(fd.get("reason") ?? "")), "Marked blocked")
          }
        >
          <Input
            name="reason"
            required
            placeholder="What is it waiting on?"
            className="h-8 min-w-56 flex-1 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Save
          </Button>
        </form>
      ) : null}
    </div>
  );
}
