import type { Metadata } from "next";

import { TeamClient, type TeamRow } from "@/app/(app)/team/team-client";
import { formatDateTime } from "@/lib/datetime";
import { requireAdmin } from "@/lib/rbac";
import { listTeam } from "@/services/users";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  // Admins only — reps are redirected to their dashboard.
  const ctx = await requireAdmin();
  const members = await listTeam(ctx);

  const rows: TeamRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    disabled: Boolean(m.disabledAt),
    isSelf: m.isSelf,
    createdAt: formatDateTime(m.createdAt, "d MMM yyyy"),
    ownedMerchants: m.ownedMerchants,
    ownedDeals: m.ownedDeals,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm">
          Add teammates, set their role, reset passwords, and offboard people who leave.
        </p>
      </div>
      <TeamClient members={rows} />
    </div>
  );
}
