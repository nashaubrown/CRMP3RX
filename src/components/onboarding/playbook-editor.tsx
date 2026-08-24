"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  addPlaybookStepAction,
  createPlaybookAction,
  duplicatePlaybookAction,
  removePlaybookStepAction,
  updatePlaybookAction,
  updatePlaybookStepAction,
} from "@/app/(app)/onboarding/playbooks/actions";
import { StageDot } from "@/components/onboarding/onboarding-bits";
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
import { ONBOARDING_STAGES, STAGE_BLURBS, STAGE_LABELS } from "@/lib/onboarding-stages";
import { cn } from "@/lib/utils";

export type EditorStep = {
  id: string;
  stage: string;
  title: string;
  ownerRole: "REP" | "DEVELOPER" | "MERCHANT";
  dueOffsetDays: number;
};

export type EditorPlaybook = {
  id: string;
  name: string;
  description: string | null;
  planLabel: string | null;
  isDefault: boolean;
  projectCount: number;
  steps: EditorStep[];
};

// Editing a playbook changes what the *next* onboarding starts from. Projects
// already running keep the checklist they were given — this is stated in the
// UI because it is the first thing an admin will wonder.
export function PlaybookEditor({ playbooks }: { playbooks: EditorPlaybook[] }) {
  const [selectedId, setSelectedId] = React.useState(playbooks[0]?.id ?? "");
  const selected = playbooks.find((p) => p.id === selectedId) ?? playbooks[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="flex flex-col gap-2">
        {playbooks.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              p.id === selected?.id ? "bg-sidebar-accent border-primary/40" : "bg-card hover:bg-muted/50"
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              {p.name}
              {p.isDefault ? (
                <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  Default
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground block text-xs">
              {p.steps.length} steps
              {p.planLabel ? ` · plan “${p.planLabel}”` : " · no plan match"}
            </span>
          </button>
        ))}
        <NewPlaybookDialog />
      </div>

      {selected ? <PlaybookPanel key={selected.id} playbook={selected} /> : null}
    </div>
  );
}

function PlaybookPanel({ playbook }: { playbook: EditorPlaybook }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function save(fields: Parameters<typeof updatePlaybookAction>[1], ok: string) {
    startTransition(async () => {
      const res = await updatePlaybookAction(playbook.id, fields);
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card surface-card flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={`pb-name-${playbook.id}`}>Name</Label>
          <Input
            id={`pb-name-${playbook.id}`}
            defaultValue={playbook.name}
            onBlur={(e) => {
              if (e.target.value.trim() !== playbook.name) save({ name: e.target.value }, "Renamed");
            }}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={`pb-plan-${playbook.id}`}>Plan it matches</Label>
          <Input
            id={`pb-plan-${playbook.id}`}
            defaultValue={playbook.planLabel ?? ""}
            placeholder="e.g. Growth"
            onBlur={(e) => {
              if ((e.target.value.trim() || null) !== playbook.planLabel)
                save({ planLabel: e.target.value }, "Plan match saved");
            }}
          />
        </div>
        <Button
          variant={playbook.isDefault ? "secondary" : "outline"}
          size="sm"
          disabled={pending || playbook.isDefault}
          onClick={() => save({ isDefault: true }, `${playbook.name} is now the fallback`)}
        >
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {playbook.isDefault ? "Fallback playbook" : "Make fallback"}
        </Button>
        <DuplicateDialog playbookId={playbook.id} name={playbook.name} />
      </div>

      <p className="text-muted-foreground text-xs">
        {`Changes apply to onboardings started from now on. The ${playbook.projectCount} project${
          playbook.projectCount === 1 ? "" : "s"
        } already using this playbook keep the checklist they were given — steps there are edited on the merchant's own page.`}
      </p>

      {ONBOARDING_STAGES.map((stage) => {
        const steps = playbook.steps.filter((s) => s.stage === stage);
        return (
          <section key={stage} className="bg-card surface-card overflow-hidden rounded-xl border">
            <header className="flex items-center gap-2.5 border-b px-4 py-2.5">
              <StageDot stage={stage} />
              <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
              <span className="text-muted-foreground hidden text-xs sm:inline">
                {STAGE_BLURBS[stage]}
              </span>
              <span className="text-muted-foreground ml-auto text-[11px] font-semibold">
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </span>
            </header>
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
            <AddStepRow playbookId={playbook.id} stage={stage} />
          </section>
        );
      })}
    </div>
  );
}

function StepRow({ step }: { step: EditorStep }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function update(fields: Parameters<typeof updatePlaybookStepAction>[1]) {
    startTransition(async () => {
      const res = await updatePlaybookStepAction(step.id, fields);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removePlaybookStepAction(step.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Step removed");
        router.refresh();
      }
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b px-4 py-2 last:border-b-0",
        pending && "opacity-60"
      )}
    >
      <Input
        defaultValue={step.title}
        className="h-8 min-w-48 flex-1 text-sm"
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value.trim() !== step.title)
            update({ title: e.target.value });
        }}
      />
      <Select
        defaultValue={step.ownerRole}
        onValueChange={(v) => update({ ownerRole: v as EditorStep["ownerRole"] })}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="REP">Perx rep</SelectItem>
          <SelectItem value="DEVELOPER">Developer</SelectItem>
          <SelectItem value="MERCHANT">Merchant</SelectItem>
        </SelectContent>
      </Select>
      <span className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          defaultValue={step.dueOffsetDays}
          className="h-8 w-16 text-xs"
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (!Number.isNaN(value) && value !== step.dueOffsetDays)
              update({ dueOffsetDays: value });
          }}
        />
        <span className="text-muted-foreground text-[11px]">days into stage</span>
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Remove ${step.title}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
}

function AddStepRow({ playbookId, stage }: { playbookId: string; stage: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [role, setRole] = React.useState("REP");
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    formData.set("stage", stage);
    formData.set("ownerRole", role);
    startTransition(async () => {
      const res = await addPlaybookStepAction(playbookId, formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-center gap-2 px-4 py-2">
      <Input
        name="title"
        required
        placeholder={`Add a step to ${STAGE_LABELS[stage as never]}…`}
        className="h-8 min-w-48 flex-1 text-sm"
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
      <Input
        name="dueOffsetDays"
        type="number"
        min={0}
        defaultValue={0}
        className="h-8 w-16 text-xs"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <PlusIcon className="size-3.5" />
        )}
        Add
      </Button>
    </form>
  );
}

function NewPlaybookDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createPlaybookAction(formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("Playbook created");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon className="size-4" /> New playbook
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>New playbook</DialogTitle>
            <DialogDescription>
              Start empty, then add the steps stage by stage. To start from an existing one
              instead, use Duplicate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-pb-name">Name</Label>
              <Input id="new-pb-name" name="name" required placeholder="e.g. Resorts" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-pb-plan">Plan it matches (optional)</Label>
              <Input id="new-pb-plan" name="planLabel" placeholder="e.g. Enterprise" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateDialog({ playbookId, name }: { playbookId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await duplicatePlaybookAction(playbookId, String(formData.get("name") ?? ""));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("Playbook copied");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CopyIcon className="size-4" /> Duplicate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Duplicate “{name}”</DialogTitle>
            <DialogDescription>
              Copies every step. The copy matches no plan until you give it one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-4">
            <Label htmlFor="dup-name">Name for the copy</Label>
            <Input id="dup-name" name="name" required defaultValue={`${name} (copy)`} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
