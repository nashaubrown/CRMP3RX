import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { StageActions, StageSection, type DetailStage } from "@/components/onboarding/project-detail";
import { Initials, StageStepper } from "@/components/onboarding/onboarding-bits";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { ONBOARDING_STAGES, STAGE_LABELS } from "@/lib/onboarding-stages";
import { requireUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { daysBetween, getOnboardingProject } from "@/services/onboarding";

export const metadata: Metadata = { title: "Onboarding" };

// One merchant's launch, end to end: where they are, what is open right now,
// what is waiting behind it, and what has already happened.
export default async function OnboardingProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const project = await getOnboardingProject(id);
  if (!project) notFound();

  const [outlets, history] = await Promise.all([
    db.outlet.findMany({
      where: { merchantId: project.merchantId },
      select: { id: true, name: true, isPrimary: true },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    }),
    db.auditLog.findMany({
      where: { merchantId: project.merchantId, action: { startsWith: "onboarding." } },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const tasksDone = project.tasks.filter((t) => t.doneAt).length;
  const pct = project.tasks.length
    ? Math.round((tasksDone / project.tasks.length) * 100)
    : 0;
  const openInStage = project.tasks.filter(
    (t) => t.stage === project.currentStage && !t.doneAt
  ).length;

  const stages: DetailStage[] = ONBOARDING_STAGES.map((key) => {
    const row = project.stages.find((s) => s.stage === key);
    return {
      stage: key,
      status: row?.status ?? "PENDING",
      enteredAt: row?.enteredAt?.toISOString() ?? null,
      completedAt: row?.completedAt?.toISOString() ?? null,
      skipReason: row?.skipReason ?? null,
      tasks: project.tasks
        .filter((t) => t.stage === key)
        .map((t) => ({
          id: t.id,
          stage: t.stage,
          title: t.title,
          description: t.description,
          ownerRole: t.ownerRole,
          source: t.source,
          assigneeName: t.assignee?.name ?? null,
          dueAt: t.dueAt?.toISOString() ?? null,
          doneAt: t.doneAt?.toISOString() ?? null,
          devTicketNumber: t.devTicket?.number ?? null,
          devTicketId: t.devTicket?.id ?? null,
        })),
    };
  });

  // Current stage first, then what is coming, then what is behind — the order
  // someone working this launch actually needs.
  const currentIndex = ONBOARDING_STAGES.indexOf(project.currentStage);
  const ordered = [
    ...stages.slice(currentIndex),
    ...stages.slice(0, currentIndex).reverse(),
  ];

  const finished = project.status !== "ACTIVE";

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[{ label: "Onboarding", href: "/onboarding" }, { label: project.merchant.name }]}
      />

      <div className="bg-card surface-card flex flex-wrap items-start gap-4 rounded-xl border p-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            <Link href={`/merchants/${project.merchantId}`} className="hover:underline">
              {project.merchant.name}
            </Link>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              project.merchant.category,
              project.merchant.branches && project.merchant.branches > 1
                ? `${project.merchant.branches} outlets`
                : null,
              project.merchant.subscriptionPlan,
              project.owner?.name ? `Owner: ${project.owner.name}` : null,
              `Started ${formatDate(project.startedAt, "d MMM")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-semibold">
              Stage {currentIndex + 1} of {ONBOARDING_STAGES.length} ·{" "}
              {STAGE_LABELS[project.currentStage]}
            </span>
            {project.targetLiveDate ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-semibold">
                Target live {formatDate(project.targetLiveDate, "d MMM")}
              </span>
            ) : null}
            {project.liveAt ? (
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-semibold">
                Live since {formatDate(project.liveAt, "d MMM")}
              </span>
            ) : null}
            {finished ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-semibold">
                {project.status === "DONE" ? "Completed" : "Cancelled"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold">{pct}% complete</p>
            <p className="text-muted-foreground text-xs">
              {tasksDone} of {project.tasks.length} steps · day {daysBetween(project.startedAt)}
            </p>
          </div>
          {finished ? null : (
            <StageActions
              projectId={project.id}
              currentStage={project.currentStage}
              openSteps={openInStage}
              blockedReason={project.blockedReason}
            />
          )}
        </div>
      </div>

      <div className="bg-card surface-card rounded-xl border p-4">
        <StageStepper
          current={project.currentStage}
          formatDay={(iso) => formatDate(iso, "d MMM")}
          stages={stages.map((s) => ({
            stage: s.stage as never,
            status: s.status,
            enteredAt: s.enteredAt,
            completedAt: s.completedAt,
            done: s.tasks.filter((t) => t.doneAt).length,
            total: s.tasks.length,
          }))}
        />
      </div>

      {project.blockedReason ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-2 rounded-xl border p-3">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-destructive text-sm font-semibold">
              Blocked — {project.blockedReason}
            </p>
            {project.blockedAt ? (
              <p className="text-muted-foreground text-xs">
                {daysBetween(project.blockedAt)} days, since{" "}
                {formatDate(project.blockedAt, "d MMM")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {ordered.map((stage) => (
            <StageSection
              key={stage.stage}
              projectId={project.id}
              stage={stage}
              current={stage.stage === project.currentStage && !finished}
              editable={!finished}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="Details">
            <Row label="Merchant">
              <Link href={`/merchants/${project.merchantId}`} className="hover:underline">
                {project.merchant.name}
              </Link>
            </Row>
            {project.deal ? (
              <Row label="Deal">
                <Link href={`/deals/${project.deal.id}`} className="hover:underline">
                  {project.deal.currency} {Number(project.deal.value).toLocaleString()}
                </Link>
              </Row>
            ) : null}
            <Row label="Owner">{project.owner?.name ?? "—"}</Row>
            <Row label="Playbook">{project.playbook?.name ?? "None"}</Row>
            <Row label="Started">{formatDate(project.startedAt, "d MMM yyyy")}</Row>
            <Row label="Target live">
              {project.targetLiveDate ? formatDate(project.targetLiveDate, "d MMM yyyy") : "—"}
            </Row>
            <Row label="Days in flight">{daysBetween(project.startedAt)}</Row>
          </Panel>

          {outlets.length > 0 ? (
            <Panel title={`Outlets (${outlets.length})`}>
              {outlets.map((o) => (
                <Row key={o.id} label={o.name}>
                  {o.isPrimary ? "Primary" : "—"}
                </Row>
              ))}
            </Panel>
          ) : null}

          <Panel title="Activity">
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing yet.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-start gap-2 border-b py-2 last:border-b-0">
                  <Initials name={h.actor?.name ?? null} />
                  <div className="min-w-0">
                    <p className="text-xs leading-snug">
                      <span className="font-semibold">{h.actor?.name ?? "System"}</span>{" "}
                      {describe(h.action, h.diff)}
                    </p>
                    <p className="stamp text-[11px]">{formatDateTime(h.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function describe(action: string, diff: unknown): string {
  const d = (diff ?? {}) as Record<string, unknown>;
  switch (action) {
    case "onboarding.start":
      return `started onboarding${d.playbook ? ` with the ${String(d.playbook)} playbook` : ""}`;
    case "onboarding.stage_advance":
      return `completed ${STAGE_LABELS[d.from as never] ?? "a stage"}`;
    case "onboarding.stage_skip":
      return `skipped ${STAGE_LABELS[d.from as never] ?? "a stage"} — ${String(d.reason ?? "")}`;
    case "onboarding.block":
      return `marked it blocked — ${String(d.reason ?? "")}`;
    case "onboarding.unblock":
      return "cleared the blocker";
    case "onboarding.task_done":
      return `ticked “${String(d.title ?? "a step")}”`;
    case "onboarding.task_reopen":
      return `reopened “${String(d.title ?? "a step")}”`;
    case "onboarding.task_add":
      return `added “${String(d.title ?? "a step")}”`;
    case "onboarding.task_remove":
      return `removed “${String(d.title ?? "a step")}”`;
    case "onboarding.cancel":
      return "cancelled the onboarding";
    default:
      return "updated the onboarding";
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card surface-card rounded-xl border p-4">
      <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0", className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-xs font-medium">{children}</span>
    </div>
  );
}
