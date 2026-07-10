import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { ownerScope, requireUser } from "@/lib/rbac";
import { listChangesToMyMerchants } from "@/services/audit-log";
import { merchantMineWhere } from "@/services/merchant-access";

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = ownerScope(user);
  // "My merchants" = owned + shared with me (hybrid sharing model).
  const mine = user.role === "ADMIN" ? {} : merchantMineWhere(user);

  const [merchantCount, contactCount, openDealCount, leadCount, feed] = await Promise.all([
    db.merchant.count({ where: mine }),
    db.contact.count({ where: { merchant: mine } }),
    db.deal.count({ where: { ...scope, stage: { notIn: ["WON", "LOST"] } } }),
    db.lead.count({ where: { ...scope, status: { in: ["NEW", "CONTACTED"] } } }),
    listChangesToMyMerchants(user),
  ]);

  const stats = [
    { label: "My merchants", value: merchantCount, description: "Owned or shared with you" },
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
          <CardTitle className="text-base">Changes by others to your merchants</CardTitle>
          <CardDescription>
            Edits, contact changes, sharing and activity logged by teammates on accounts you own
            {user.role === "ADMIN" ? " (admins: across all accounts)" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing yet — when a teammate changes one of your records, it shows up here.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {feed.map((event) => (
                <li key={event.id} className="flex flex-col gap-0.5 text-sm">
                  <span>
                    <span className="font-medium">{event.actorName}</span> {event.title}
                    {" · "}
                    <Link href={`/merchants/${event.merchantId}`} className="hover:underline">
                      <span className="font-medium">{event.merchantName}</span>
                    </Link>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline dashboard</CardTitle>
          <CardDescription>
            Pipeline value, deals by stage, activities due today and recent communications land in
            Phase 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
