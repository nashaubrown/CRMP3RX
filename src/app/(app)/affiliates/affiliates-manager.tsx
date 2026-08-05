"use client";

import * as React from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createAffiliateAction,
  setAffiliateActiveAction,
  updateAffiliateAction,
} from "@/app/(app)/affiliates/manage-actions";
import { revealBankAccountAction } from "@/app/(app)/affiliates/portal-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Affiliate = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  commissionRate: number;
  active: boolean;
  merchantCount: number;
  // Portal fields (self-registration / payouts)
  payoutSchedule: "MONTHLY" | "QUARTERLY" | "YEARLY";
  idCardNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  tcVersion: string | null;
  tcAcceptedAtLabel: string | null;
  lastPortalLoginAtLabel: string | null;
  portalLeadCount: number;
  isAdmin: boolean;
};

const SCHEDULE_LABELS: Record<Affiliate["payoutSchedule"], string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

// Bank details stay masked until an admin explicitly reveals them —
// decrypt-on-demand, audit-logged server-side.
function BankReveal({ affiliate }: { affiliate: Affiliate }) {
  const [pending, startTransition] = React.useTransition();
  const [revealed, setRevealed] = React.useState<string | null>(null);

  if (!affiliate.bankAccountLast4) return null;
  if (revealed) {
    return <span className="font-mono text-xs">{revealed}</span>;
  }
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground text-xs underline decoration-dotted"
      disabled={pending || !affiliate.isAdmin}
      title={affiliate.isAdmin ? "Reveal (audit-logged)" : "Admins only"}
      onClick={() =>
        startTransition(async () => {
          const res = await revealBankAccountAction(affiliate.id);
          if (res.error) toast.error(res.error);
          else setRevealed(res.accountNumber ?? null);
        })
      }
    >
      •••• {affiliate.bankAccountLast4}
    </button>
  );
}

type Draft = {
  name: string;
  email: string;
  phone: string;
  commissionRate: string;
  payoutSchedule: string;
};

function AffiliateFields({
  draft,
  setDraft,
  disabled,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Name *</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Affiliate name"
          className="h-8"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Commission (% of MRR)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={draft.commissionRate}
          onChange={(e) => setDraft({ ...draft, commissionRate: e.target.value })}
          placeholder="e.g. 10"
          className="h-8"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          placeholder="name@example.com"
          className="h-8"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Phone</Label>
        <Input
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          placeholder="+960 777 1234"
          className="h-8"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Payout schedule</Label>
        <Select
          value={draft.payoutSchedule}
          onValueChange={(v) => setDraft({ ...draft, payoutSchedule: v })}
          disabled={disabled}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="QUARTERLY">Quarterly</SelectItem>
            <SelectItem value="YEARLY">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AffiliateRow({ affiliate }: { affiliate: Affiliate }) {
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({
    name: affiliate.name,
    email: affiliate.email ?? "",
    phone: affiliate.phone ?? "",
    commissionRate: String(affiliate.commissionRate),
    payoutSchedule: affiliate.payoutSchedule,
  });

  function save() {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await updateAffiliateAction(affiliate.id, {
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        commissionRate: draft.commissionRate,
        payoutSchedule: draft.payoutSchedule,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Saved");
        setEditing(false);
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await setAffiliateActiveAction(affiliate.id, !affiliate.active);
      if (res.error) toast.error(res.error);
      else toast.success(affiliate.active ? "Deactivated" : "Reactivated");
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 rounded-md border p-3">
        <AffiliateFields draft={draft} setDraft={setDraft} disabled={pending} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setDraft({
                name: affiliate.name,
                email: affiliate.email ?? "",
                phone: affiliate.phone ?? "",
                commissionRate: String(affiliate.commissionRate),
                payoutSchedule: affiliate.payoutSchedule,
              });
            }}
          >
            <XIcon /> Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        !affiliate.active && "opacity-60"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{affiliate.name}</span>
          {/* The permanent referral code. Monospace + tracking so it reads
              cleanly when quoted over the phone; never editable. */}
          <span
            className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[11px] tracking-widest"
            title="Permanent referral code"
          >
            {affiliate.code}
          </span>
          <Badge
            variant="outline"
            className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          >
            {affiliate.commissionRate}%
          </Badge>
          {!affiliate.active ? <Badge variant="outline">Inactive</Badge> : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {[affiliate.email, affiliate.phone].filter(Boolean).join(" · ") || "No contact details"}
          {" · "}
          {affiliate.merchantCount} merchant{affiliate.merchantCount === 1 ? "" : "s"}
          {" · paid "}
          {SCHEDULE_LABELS[affiliate.payoutSchedule].toLowerCase()}
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 truncate text-xs">
          {affiliate.idCardNumber ? <span>ID {affiliate.idCardNumber}</span> : null}
          {affiliate.bankAccountLast4 ? (
            <span className="inline-flex items-center gap-1">
              {affiliate.bankName ?? "Bank"} <BankReveal affiliate={affiliate} />
            </span>
          ) : (
            <span>No bank details</span>
          )}
          {affiliate.tcVersion ? (
            <span>
              Terms v{affiliate.tcVersion}
              {affiliate.tcAcceptedAtLabel ? ` (${affiliate.tcAcceptedAtLabel})` : ""}
            </span>
          ) : (
            <span>Terms unsigned</span>
          )}
          <span>
            {affiliate.lastPortalLoginAtLabel
              ? `Portal: ${affiliate.lastPortalLoginAtLabel}`
              : "Never signed in"}
          </span>
          {affiliate.portalLeadCount > 0 ? (
            <span>
              {affiliate.portalLeadCount} referral{affiliate.portalLeadCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={`Edit ${affiliate.name}`}
        onClick={() => setEditing(true)}
        disabled={pending}
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={affiliate.active ? `Deactivate ${affiliate.name}` : `Reactivate ${affiliate.name}`}
        onClick={toggleActive}
        disabled={pending}
      >
        {affiliate.active ? (
          <ArchiveIcon className="size-3.5" />
        ) : (
          <ArchiveRestoreIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

function AddAffiliate() {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const empty: Draft = {
    name: "",
    email: "",
    phone: "+960 ",
    commissionRate: "",
    payoutSchedule: "MONTHLY",
  };
  const [draft, setDraft] = React.useState<Draft>(empty);

  function add() {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await createAffiliateAction({
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        commissionRate: draft.commissionRate || 0,
        payoutSchedule: draft.payoutSchedule,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Added "${draft.name.trim()}"`);
        setDraft(empty);
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> Add affiliate
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
      <AffiliateFields draft={draft} setDraft={setDraft} disabled={pending} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setDraft(empty);
          }}
        >
          <XIcon /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={add} disabled={pending || !draft.name.trim()}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
        </Button>
      </div>
    </div>
  );
}

export function AffiliatesManager({ affiliates }: { affiliates: Affiliate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affiliates</CardTitle>
        <CardDescription>
          Referral partners who earn a commission (a % of MRR) for every merchant they bring in.
          Pick one on the merchant form; each gets a permanent referral code.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {affiliates.map((a) => (
          <AffiliateRow key={a.id} affiliate={a} />
        ))}
        {affiliates.length === 0 ? (
          <p className="text-muted-foreground text-sm">No affiliates yet.</p>
        ) : null}
        <div className="pt-1">
          <AddAffiliate />
        </div>
      </CardContent>
    </Card>
  );
}
