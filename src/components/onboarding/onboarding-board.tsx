import Link from "next/link";
import { AlertTriangleIcon, CalendarCheckIcon } from "lucide-react";

import {
  DaysInStage,
  Initials,
  StageDot,
  StageRail,
} from "@/components/onboarding/onboarding-bits";
import { ONBOARDING_STAGES, STAGE_BLURBS, STAGE_LABELS } from "@/lib/onboarding-stages";
import type { ProjectCard } from "@/services/onboarding";
import { formatDate } from "@/lib/datetime";

// The portfolio at a glance: one column per stage, one card per merchant.
// Cards are links rather than draggable tiles — moving a merchant forward is a
// decision made on their page, where the checklist that justifies it lives.
export function OnboardingBoard({ projects }: { projects: ProjectCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {ONBOARDING_STAGES.map((stage) => {
        const inStage = projects.filter((p) => p.stage === stage);
        return (
          <section
            key={stage}
            className="bg-card/50 flex min-h-40 flex-col gap-2 rounded-xl border p-2.5"
            aria-label={STAGE_LABELS[stage]}
          >
            <header className="flex items-center gap-2 px-0.5">
              <StageDot stage={stage} />
              <h2 className="text-sm font-semibold tracking-tight">{STAGE_LABELS[stage]}</h2>
              <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 text-[11px] font-semibold">
                {inStage.length}
              </span>
            </header>
            {inStage.length === 0 ? (
              <p className="text-muted-foreground px-0.5 text-[11px] leading-snug">
                {STAGE_BLURBS[stage]}
              </p>
            ) : (
              inStage.map((p) => <BoardCard key={p.id} project={p} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ project: p }: { project: ProjectCard }) {
  return (
    <Link
      href={`/onboarding/${p.id}`}
      className="bg-card surface-card hover:border-primary/40 flex flex-col gap-2 rounded-lg border p-2.5 transition-colors"
    >
      {p.blockedReason ? (
        <span className="text-destructive bg-destructive/10 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold">
          <AlertTriangleIcon className="size-3" />
          Blocked {p.blockedDays ? `${p.blockedDays}d` : ""}
        </span>
      ) : p.targetLiveDate && p.stage === "GO_LIVE" ? (
        <span className="text-primary bg-primary/10 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold">
          <CalendarCheckIcon className="size-3" />
          Live {formatDate(p.targetLiveDate, "d MMM")}
        </span>
      ) : null}

      <div>
        <p className="text-sm leading-snug font-semibold">{p.merchantName}</p>
        <p className="text-muted-foreground text-[11px]">
          {[p.plan, p.branches && p.branches > 1 ? `${p.branches} outlets` : null]
            .filter(Boolean)
            .join(" · ") || "No plan set"}
        </p>
      </div>

      <StageRail current={p.stage} completed={p.completedStages} />

      <div className="flex items-center gap-2">
        <Initials name={p.ownerName} />
        <span className="text-muted-foreground text-[11px] font-semibold">
          {p.stageTasksDone}/{p.stageTasksTotal}
        </span>
        {p.overdueTasks > 0 ? (
          <span className="text-destructive text-[11px] font-semibold">
            {p.overdueTasks} overdue
          </span>
        ) : null}
        <span className="ml-auto">
          <DaysInStage days={p.daysInStage} />
        </span>
      </div>
    </Link>
  );
}

// The denser read: every merchant on one screen, sorted by how stuck they are.
export function OnboardingTracker({ projects }: { projects: ProjectCard[] }) {
  const rows = [...projects].sort((a, b) => b.daysInStage - a.daysInStage);
  return (
    <div className="bg-card surface-card overflow-hidden rounded-xl border">
      <div className="text-muted-foreground grid grid-cols-[1.6fr_1.4fr_0.8fr_0.7fr_0.7fr] gap-3 border-b px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">
        <span>Merchant</span>
        <span>Progress</span>
        <span>Stage</span>
        <span>Owner</span>
        <span className="text-right">In stage</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">Nothing in flight.</p>
      ) : (
        rows.map((p) => (
          <Link
            key={p.id}
            href={`/onboarding/${p.id}`}
            className="hover:bg-muted/50 grid grid-cols-[1.6fr_1.4fr_0.8fr_0.7fr_0.7fr] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.merchantName}</span>
              <span className="text-muted-foreground text-[11px]">
                {p.blockedReason ? (
                  <span className="text-destructive font-semibold">
                    Blocked · {p.blockedReason}
                  </span>
                ) : (
                  `${p.tasksDone}/${p.tasksTotal} steps · day ${p.daysInFlight}`
                )}
              </span>
            </span>
            <StageRail current={p.stage} completed={p.completedStages} />
            <span className="text-muted-foreground text-xs">{STAGE_LABELS[p.stage]}</span>
            <span className="flex items-center gap-1.5 text-xs">
              <Initials name={p.ownerName} />
              <span className="text-muted-foreground truncate">{p.ownerName ?? "—"}</span>
            </span>
            <span className="text-right">
              <DaysInStage days={p.daysInStage} />
            </span>
          </Link>
        ))
      )}
    </div>
  );
}
