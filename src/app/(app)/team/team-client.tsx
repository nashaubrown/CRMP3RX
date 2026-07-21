"use client";

import * as React from "react";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createTeamUserAction,
  resetTeamPasswordAction,
  setTeamDisabledAction,
  setTeamRoleAction,
} from "@/app/(app)/team/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "SALES_REP";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
  isSelf: boolean;
  createdAt: string;
  ownedMerchants: number;
  ownedDeals: number;
};

// A short, readable temporary password an admin can hand over verbally.
function suggestPassword(): string {
  const words = [
    "Coral",
    "Mango",
    "Palm",
    "Reef",
    "Atoll",
    "Lagoon",
    "Tuna",
    "Dhoni",
    "Malé",
    "Sunny",
  ];
  // Deterministic-per-render is fine; we just need something non-obvious.
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${pick()}-${pick()}-${n}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return role === "ADMIN" ? (
    <Badge className="border-transparent bg-primary/15 text-primary">Admin</Badge>
  ) : (
    <Badge variant="secondary">Sales rep</Badge>
  );
}

function AddMemberForm() {
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("SALES_REP");
  const [password, setPassword] = React.useState(suggestPassword);
  const [created, setCreated] = React.useState<{ email: string; password: string } | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTeamUserAction({ name, email, role, password });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setCreated({ email, password });
      toast.success(`${name} added — share their password now`);
      setName("");
      setEmail("");
      setRole("SALES_REP");
      setPassword(suggestPassword());
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlusIcon className="size-4" /> Add a teammate
        </CardTitle>
        <CardDescription>
          Creates an account they can sign in to right away. Share the password with them —
          they can change it later. (No email is sent.)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {created ? (
          <div className="bg-muted/50 flex flex-col gap-1 rounded-lg border p-3 text-sm">
            <p className="font-medium">Account created — hand these over securely:</p>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground w-20 shrink-0">Email</span>
              <code className="bg-background overflow-x-auto rounded px-2 py-1 text-xs">
                {created.email}
              </code>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground w-20 shrink-0">Password</span>
              <code className="bg-background overflow-x-auto rounded px-2 py-1 text-xs">
                {created.password}
              </code>
              <CopyButton value={created.password} label="password" />
            </span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-name">Name</Label>
            <Input
              id="tm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aishath Ali"
              autoComplete="off"
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-email">Email</Label>
            <Input
              id="tm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="aishath@perx.mv"
              autoComplete="off"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="tm-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SALES_REP">Sales rep — sees only their own records</SelectItem>
                <SelectItem value="ADMIN">Admin — full access & team management</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-password">Temporary password</Label>
            <div className="flex gap-1">
              <Input
                id="tm-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore
                minLength={8}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setPassword(suggestPassword())}
              >
                Suggest
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} Add teammate
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ResetPasswordDialog({
  member,
  onDone,
}: {
  member: TeamRow;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState(suggestPassword);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await resetTeamPasswordAction(member.id, password);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Password reset for ${member.name}`);
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPassword(suggestPassword());
      }}
    >
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <KeyRoundIcon className="size-3.5" /> Reset password
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {member.name} ({member.email}) and share it with them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex gap-1">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore
              minLength={8}
              required
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setPassword(suggestPassword())}
            >
              Suggest
            </Button>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null} Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ member }: { member: TeamRow }) {
  const [pending, startTransition] = React.useTransition();

  function changeRole(role: Role) {
    if (role === member.role) return;
    startTransition(async () => {
      const result = await setTeamRoleAction(member.id, role);
      if (result.error) toast.error(result.error);
      else toast.success(`${member.name} is now ${role === "ADMIN" ? "an admin" : "a sales rep"}`);
    });
  }

  function toggleDisabled() {
    const disabled = !member.disabled;
    startTransition(async () => {
      const result = await setTeamDisabledAction(member.id, disabled);
      if (result.error) toast.error(result.error);
      else toast.success(disabled ? `${member.name} disabled` : `${member.name} re-enabled`);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
        member.disabled && "opacity-60"
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{member.name}</span>
          {member.isSelf ? (
            <span className="text-muted-foreground text-xs">(you)</span>
          ) : null}
          <RoleBadge role={member.role} />
          {member.disabled ? (
            <Badge variant="outline" className="text-destructive border-destructive/40">
              Disabled
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-sm">{member.email}</p>
        <p className="text-muted-foreground text-xs">
          {member.ownedMerchants} merchant{member.ownedMerchants === 1 ? "" : "s"} ·{" "}
          {member.ownedDeals} deal{member.ownedDeals === 1 ? "" : "s"} · joined {member.createdAt}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={member.role}
          onValueChange={(v) => changeRole(v as Role)}
          disabled={pending || member.disabled}
        >
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SALES_REP">Sales rep</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>

        <ResetPasswordDialog member={member} onDone={() => {}} />

        {member.isSelf ? null : (
          <Button
            variant={member.disabled ? "outline" : "ghost"}
            size="sm"
            className={member.disabled ? "" : "text-destructive"}
            disabled={pending}
            onClick={toggleDisabled}
          >
            {member.disabled ? "Re-enable" : "Disable"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TeamClient({ members }: { members: TeamRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <AddMemberForm />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>
            {members.length} account{members.length === 1 ? "" : "s"}. Disabling keeps someone&apos;s
            records but blocks their sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
