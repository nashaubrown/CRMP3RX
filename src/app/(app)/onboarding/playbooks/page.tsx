import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PlaybookEditor, type EditorPlaybook } from "@/components/onboarding/playbook-editor";
import { requireAdmin } from "@/lib/rbac";
import { ensureDefaultPlaybooks, listPlaybooks } from "@/services/onboarding";

export const metadata: Metadata = { title: "Onboarding playbooks" };

// Admin-only: the checklists new onboardings start from. Reps edit steps on a
// merchant's own project; this is where the template itself changes.
export default async function PlaybooksPage() {
  await requireAdmin();
  await ensureDefaultPlaybooks();
  const playbooks = await listPlaybooks();

  const rows: EditorPlaybook[] = playbooks.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    planLabel: p.planLabel,
    isDefault: p.isDefault,
    projectCount: p._count.projects,
    steps: p.tasks.map((t) => ({
      id: t.id,
      stage: t.stage,
      title: t.title,
      ownerRole: t.ownerRole,
      dueOffsetDays: t.dueOffsetDays,
    })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Onboarding", href: "/onboarding" }, { label: "Playbooks" }]} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Playbooks</h1>
        <p className="text-muted-foreground text-sm">
          The checklist a new onboarding starts from, matched to the merchant&apos;s plan. Due
          dates are days after that stage begins, not days from the start of the project.
        </p>
      </div>
      <PlaybookEditor playbooks={rows} />
    </div>
  );
}
