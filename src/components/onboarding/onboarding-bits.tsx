import type { OnboardingStageKey } from "@prisma/client";

import { ONBOARDING_STAGES, STAGE_DOT, STAGE_LABELS, stageIndex } from "@/lib/onboarding-stages";
import { cn } from "@/lib/utils";

// Shared, server-safe presentation for onboarding. Deliberately not a client
// module: a "use client" file's non-component exports reach a server component
// as reference proxies, and this one is imported from both sides.

export function StageDot({ stage, className }: { stage: OnboardingStageKey; className?: string }) {
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage], className)}
      aria-hidden
    />
  );
}

export function StageBadge({ stage }: { stage: OnboardingStageKey }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <StageDot stage={stage} />
      {STAGE_LABELS[stage]}
    </span>
  );
}

// Seven ticks, one per stage: filled behind, half-lit for the stage in flight.
// The whole point of the board is reading progress without opening a card.
export function StageRail({
  current,
  completed,
  className,
}: {
  current: OnboardingStageKey;
  completed: OnboardingStageKey[];
  className?: string;
}) {
  const done = new Set(completed);
  const currentIndex = stageIndex(current);
  return (
    <div
      className={cn("flex gap-[3px]", className)}
      role="img"
      aria-label={`Stage ${currentIndex + 1} of ${ONBOARDING_STAGES.length}: ${STAGE_LABELS[current]}`}
    >
      {ONBOARDING_STAGES.map((stage, i) => (
        <span
          key={stage}
          className={cn(
            "h-1 flex-1 rounded-full",
            done.has(stage)
              ? "bg-primary"
              : i === currentIndex
                ? "bg-primary/45"
                : "bg-muted-foreground/15"
          )}
        />
      ))}
    </div>
  );
}

export type StepperStage = {
  stage: OnboardingStageKey;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED";
  enteredAt: string | null;
  completedAt: string | null;
  done: number;
  total: number;
};

// The whole launch on one line: which stages are behind, which is live, and
// when each happened. Reading this should answer "where are they?" without
// scrolling into the checklists.
export function StageStepper({
  stages,
  current,
  formatDay,
}: {
  stages: StepperStage[];
  current: OnboardingStageKey;
  formatDay: (iso: string) => string;
}) {
  return (
    <ol className="flex gap-1 overflow-x-auto">
      {stages.map((s) => {
        const isCurrent = s.stage === current;
        const settled = s.status === "DONE" || s.status === "SKIPPED";
        return (
          <li key={s.stage} className="min-w-24 flex-1">
            <span
              className={cn(
                "mb-2 block h-1.5 rounded-full",
                settled ? "bg-primary" : isCurrent ? "bg-primary/45" : "bg-muted-foreground/15"
              )}
            />
            <p className={cn("text-xs font-semibold", isCurrent && "text-primary")}>
              {STAGE_LABELS[s.stage]}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {s.enteredAt && s.completedAt
                ? `${formatDay(s.enteredAt)}–${formatDay(s.completedAt)}`
                : s.enteredAt
                  ? `since ${formatDay(s.enteredAt)}`
                  : "—"}
            </p>
            <p className="text-muted-foreground text-[11px] font-semibold">
              {s.status === "SKIPPED"
                ? "skipped"
                : s.total === 0
                  ? ""
                  : `${s.done}/${s.total}${settled ? " ✓" : ""}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// Days in a stage, coloured once it stops being normal. Thresholds are
// deliberately blunt: a week is slow, two weeks is stuck.
export function DaysInStage({ days }: { days: number }) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold",
        days >= 14 ? "text-destructive" : days >= 7 ? "text-amber-600" : "text-muted-foreground"
      )}
    >
      {days}d in stage
    </span>
  );
}

export function Initials({ name }: { name: string | null }) {
  const text = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="bg-primary/10 text-primary flex size-5 items-center justify-center rounded-full text-[9px] font-bold"
      title={name ?? undefined}
    >
      {text}
    </span>
  );
}
