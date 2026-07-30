import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercentIcon } from "lucide-react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { RangePicker } from "@/components/affiliates/range-picker";
import { CommissionLedger } from "@/components/affiliates/commission-ledger";
import { EmptyState } from "@/components/list/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DownloadIcon } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { isAdmin, requireUser } from "@/lib/rbac";
import { getAffiliateReport, getCommissionLedger, monthsInRange } from "@/services/affiliates";

export const metadata: Metadata = { title: "Affiliates" };

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Current calendar month as YYYY-MM.
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; ledger?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = await searchParams;

  const thisMonth = currentMonth();
  const from = sp.from && YM.test(sp.from) ? sp.from : thisMonth;
  const toRaw = sp.to && YM.test(sp.to) ? sp.to : thisMonth;
  // Keep the range ordered.
  const to = toRaw < from ? from : toRaw;
  const ledgerPeriod = sp.ledger && YM.test(sp.ledger) ? sp.ledger : thisMonth;

  const months = monthsInRange(from, to);
  const [report, ledger] = await Promise.all([
    getAffiliateReport(months),
    getCommissionLedger(ledgerPeriod),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Affiliates" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Affiliates</h1>
          <p className="text-muted-foreground text-sm">
            Referral partners and the commission owed for the merchants they bring in
          </p>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          icon={BadgePercentIcon}
          title="No affiliates yet"
          description="Add affiliates in Settings, then pick one on the merchant form to start tracking referrals."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">Go to Settings</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Projected commission</CardTitle>
                <CardDescription>
                  {months} month{months === 1 ? "" : "s"} ({from} → {to}). Recurring commission is a
                  % of each referred live merchant&apos;s MRR.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <RangePicker from={from} to={to} />
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/export/affiliates?from=${from}&to=${to}`} download>
                    <DownloadIcon /> Export CSV
                  </a>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Affiliate</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Brought</TableHead>
                    <TableHead className="text-right">Live</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="pr-6 text-right">
                      Owed ({months} mo)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.affiliateId}>
                      <TableCell className="pl-6 font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.commissionRate}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.merchantsBrought}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.onboarded > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {row.onboarded}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {row.monthlyCommissionMvr > 0
                          ? money(row.monthlyCommissionMvr, report.currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {row.rangeCommissionMvr > 0
                          ? money(row.rangeCommissionMvr, report.currency)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {report.rows.length > 1 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="pl-6 font-medium">Total</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-medium tabular-nums">
                        {report.totals.merchantsBrought}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {report.totals.onboarded}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(report.totals.monthlyCommissionMvr, report.currency)}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {money(report.totals.rangeCommissionMvr, report.currency)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
            <p className="text-muted-foreground px-6 pt-4 text-xs">
              Estimate based on current plan pricing and live status — we don&apos;t store historical
              MRR or activation dates, so the range total is the monthly commission × the number of
              months selected.
            </p>
          </CardContent>
        </Card>
      )}

      {report.rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout ledger</CardTitle>
            <CardDescription>
              Record a month to freeze the commission owed, then mark each affiliate paid. Recorded
              amounts don&apos;t change if merchants or pricing change later.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <CommissionLedger
              period={ledger.period || currentMonth()}
              currency={ledger.currency}
              pendingMvr={ledger.pendingMvr}
              paidMvr={ledger.paidMvr}
              totalMvr={ledger.totalMvr}
              isAdmin={admin}
              entries={ledger.entries.map((e) => ({
                id: e.id,
                affiliateName: e.affiliateName,
                amountMvr: e.amountMvr,
                commissionRate: e.commissionRate,
                merchantCount: e.merchantCount,
                status: e.status,
                paidAtLabel: e.paidAt ? formatDate(e.paidAt) : null,
                paidByName: e.paidByName,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
