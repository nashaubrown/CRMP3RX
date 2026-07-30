"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import {
  recordCommissionsAction,
  setCommissionStatusAction,
} from "@/app/(app)/affiliates/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type LedgerEntry = {
  id: string;
  affiliateName: string;
  amountMvr: number;
  commissionRate: number;
  merchantCount: number;
  status: "PENDING" | "PAID";
  paidAtLabel: string | null;
  paidByName: string | null;
};

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function StatusButton({ id, status }: { id: string; status: "PENDING" | "PAID" }) {
  const [pending, startTransition] = React.useTransition();
  const next = status === "PAID" ? "PENDING" : "PAID";
  function toggle() {
    startTransition(async () => {
      const res = await setCommissionStatusAction(id, next);
      if (res.error) toast.error(res.error);
      else toast.success(next === "PAID" ? "Marked paid" : "Marked pending");
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7"
      onClick={toggle}
      disabled={pending}
    >
      {pending ? (
        <Loader2Icon className="animate-spin" />
      ) : status === "PAID" ? (
        <RotateCcwIcon />
      ) : (
        <CheckCircle2Icon />
      )}
      {status === "PAID" ? "Undo" : "Mark paid"}
    </Button>
  );
}

export function CommissionLedger({
  period,
  entries,
  pendingMvr,
  paidMvr,
  totalMvr,
  currency,
  isAdmin,
}: {
  period: string;
  entries: LedgerEntry[];
  pendingMvr: number;
  paidMvr: number;
  totalMvr: number;
  currency: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [recording, startRecording] = React.useTransition();

  function setPeriod(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("ledger", value);
    else params.delete("ledger");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function record() {
    startRecording(async () => {
      const res = await recordCommissionsAction(period);
      if (res.error) toast.error(res.error);
      else toast.success(`Recorded ${period}: ${res.summary}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ledger-month" className="text-muted-foreground text-xs">
              Month
            </label>
            <Input
              id="ledger-month"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        </div>
        {isAdmin ? (
          <Button type="button" size="sm" variant="outline" onClick={record} disabled={recording}>
            {recording ? <Loader2Icon className="animate-spin" /> : null}
            {entries.length ? "Re-record this month" : "Record commissions"}
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground px-6 pb-2 text-sm">
          {isAdmin
            ? "No commissions recorded for this month yet — click Record commissions to snapshot the current amounts."
            : "No commissions recorded for this month yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Affiliate</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Merchants</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6">{isAdmin ? "Action" : "Paid"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-6 font-medium">{e.affiliateName}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.commissionRate}%</TableCell>
                  <TableCell className="text-right tabular-nums">{e.merchantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(e.amountMvr, currency)}
                  </TableCell>
                  <TableCell>
                    {e.status === "PAID" ? (
                      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Paid
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-6">
                    {isAdmin ? (
                      <StatusButton id={e.id} status={e.status} />
                    ) : e.status === "PAID" && e.paidAtLabel ? (
                      <span className="text-muted-foreground text-xs">
                        {e.paidAtLabel}
                        {e.paidByName ? ` · ${e.paidByName}` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-6 font-medium" colSpan={3}>
                  Pending {money(pendingMvr, currency)} · Paid {money(paidMvr, currency)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(totalMvr, currency)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
