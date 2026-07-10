"use client";

import * as React from "react";
import { Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { removeShareAction, setShareAction } from "@/app/(app)/merchants/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_ACCESS = "NONE";

type TeamMember = { id: string; name: string; role: string };
type Share = { userId: string; permission: "VIEW" | "EDIT" };

export function ShareDialog({
  merchantId,
  ownerId,
  ownerName,
  team,
  shares,
}: {
  merchantId: string;
  ownerId: string;
  ownerName: string;
  team: TeamMember[];
  shares: Share[];
}) {
  const [pending, startTransition] = React.useTransition();
  const shareMap = new Map(shares.map((s) => [s.userId, s.permission]));
  const candidates = team.filter((u) => u.id !== ownerId);

  function onChange(userId: string, value: string) {
    startTransition(async () => {
      const result =
        value === NO_ACCESS
          ? await removeShareAction(merchantId, userId)
          : await setShareAction(merchantId, userId, value as "VIEW" | "EDIT");
      if (result.error) toast.error(result.error);
      else toast.success("Sharing updated");
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2Icon /> Share
          {shares.length > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {shares.length}
            </Badge>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share merchant</DialogTitle>
          <DialogDescription>
            Everyone can already view this merchant. <strong>View</strong> adds it to a
            teammate&apos;s &ldquo;shared with me&rdquo; working set; <strong>Edit</strong> also
            lets them update details, contacts and log activity. Owned by {ownerName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {candidates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No other team members yet.</p>
          ) : (
            candidates.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {user.role === "ADMIN" ? "Admin (always full access)" : "Sales rep"}
                  </p>
                </div>
                <Select
                  value={shareMap.get(user.id) ?? NO_ACCESS}
                  onValueChange={(v) => onChange(user.id, v)}
                  disabled={pending || user.role === "ADMIN"}
                >
                  <SelectTrigger className="w-32" aria-label={`Access for ${user.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCESS}>No access</SelectItem>
                    <SelectItem value="VIEW">View</SelectItem>
                    <SelectItem value="EDIT">Edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
