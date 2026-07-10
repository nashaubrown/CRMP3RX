import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ownerScope, requireUser } from "@/lib/rbac";

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = ownerScope(user);

  const [merchantCount, contactCount, openDealCount, leadCount] = await Promise.all([
    db.merchant.count({ where: { ...scope } }),
    db.contact.count({ where: user.role === "ADMIN" ? {} : { ownerId: user.id } }),
    db.deal.count({ where: { ...scope, stage: { notIn: ["WON", "LOST"] } } }),
    db.lead.count({ where: { ...scope, status: { in: ["NEW", "CONTACTED"] } } }),
  ]);

  const stats = [
    { label: "Merchants", value: merchantCount, description: "Accounts you manage" },
    { label: "Contacts", value: contactCount, description: "People at your merchants" },
    { label: "Open deals", value: openDealCount, description: "In the pipeline" },
    { label: "Active leads", value: leadCount, description: "New or contacted" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here&apos;s a snapshot of your book of business.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline dashboard</CardTitle>
          <CardDescription>
            Pipeline value, deals by stage, activities due today and recent communications land in
            Phase 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
