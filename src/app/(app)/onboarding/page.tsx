import type { Metadata } from "next";
import Link from "next/link";

import {
  OnboardingBoard,
  OnboardingTracker,
} from "@/components/onboarding/onboarding-board";
import {
  StartOnboardingDialog,
  type PlaybookOption,
  type StartOption,
} from "@/components/onboarding/start-onboarding";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { ensureDefaultPlaybooks, listOnboarding, onboardingMetrics } from "@/services/onboarding";

export const metadata: Metadata = { title: "Onboarding" };

// Everything between "deal won" and "merchant live". The board is the default
// read; the tracker is the same data at higher density, sorted by how stuck
// each merchant is.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view = params.view === "tracker" ? "tracker" : "board";
  const mine = params.mine === "1";

  await ensureDefaultPlaybooks();

  const [projects, metrics, startable, playbooks] = await Promise.all([
    listOnboarding({ ownerId: mine ? user.id : null }),
    onboardingMetrics(),
    db.merchant.findMany({
      where: { onboarding: null },
      select: { id: true, name: true, subscriptionPlan: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    db.onboardingPlaybook.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const merchantOptions: StartOption[] = startable.map((m) => ({
    id: m.id,
    name: m.name,
    plan: m.subscriptionPlan,
  }));
  const playbookOptions: PlaybookOption[] = playbooks.map((p) => ({
    id: p.id,
    name: p.name,
    taskCount: p._count.tasks,
  }));

  const summary = [
    `${metrics.inFlight} in flight`,
    metrics.blocked > 0 ? `${metrics.blocked} blocked` : null,
    metrics.goingLiveSoon > 0 ? `${metrics.goingLiveSoon} going live within 7 days` : null,
    metrics.medianDaysToLive !== null ? `median ${metrics.medianDaysToLive} days to live` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
          <p className="text-muted-foreground text-sm">
            {summary || "Nothing in flight — win a deal and a project starts itself."}
          </p>
        </div>
        <StartOnboardingDialog merchants={merchantOptions} playbooks={playbookOptions} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card flex overflow-hidden rounded-lg border text-sm">
          <ViewTab href={`/onboarding${mine ? "?mine=1" : ""}`} active={view === "board"}>
            Board
          </ViewTab>
          <ViewTab
            href={`/onboarding?view=tracker${mine ? "&mine=1" : ""}`}
            active={view === "tracker"}
          >
            Tracker
          </ViewTab>
        </div>
        <ViewTab
          href={
            mine
              ? `/onboarding${view === "tracker" ? "?view=tracker" : ""}`
              : `/onboarding?${view === "tracker" ? "view=tracker&" : ""}mine=1`
          }
          active={mine}
          className="bg-card rounded-full border px-3 py-1.5 text-sm"
        >
          Mine only
        </ViewTab>
      </div>

      {view === "tracker" ? (
        <OnboardingTracker projects={projects} />
      ) : (
        <OnboardingBoard projects={projects} />
      )}
    </div>
  );
}

function ViewTab({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 font-medium",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground",
        className
      )}
    >
      {children}
    </Link>
  );
}
