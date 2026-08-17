"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, PaperclipIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  addDevAttachmentAction,
  addDevCommentAction,
  deleteDevTicketAction,
  moveDevTicketAction,
  updateDevTicketAction,
} from "@/app/(app)/dev/actions";
import {
  PRIORITY_LABELS,
  PRODUCT_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  TYPE_LABELS,
  type TicketPriority,
  type TicketProduct,
  type TicketStatus,
  type TicketType,
} from "@/components/dev/ticket-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MerchantOption, PersonOption } from "@/components/dev/ticket-form";

const NONE = "__none__";

export type TicketDetailData = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: TicketType;
  product: TicketProduct;
  priority: TicketPriority;
  status: TicketStatus;
  reporter: { id: string; name: string };
  assigneeId: string | null;
  merchantId: string | null;
  merchantName: string | null;
  canDelete: boolean;
  comments: { id: string; body: string; authorName: string; at: string }[];
  attachments: { id: string; filename: string; contentType: string; sizeBytes: number }[];
  history: { id: string; line: string; actor: string; at: string }[];
};

// One meta control that persists immediately — the detail page has no Save
// button; every change lands the moment it's made, like the board.
function MetaSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(v) =>
          startTransition(async () => {
            const res = await onSave(v);
            if (res.error) toast.error(res.error);
            else router.refresh();
          })
        }
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TicketDetail({
  ticket,
  people,
  merchants,
}: {
  ticket: TicketDetailData;
  people: PersonOption[];
  merchants: MerchantOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [comment, setComment] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Field edits reuse the full update action, so every save re-sends the
  // ticket's current shape with one field changed.
  function patch(field: string, value: string) {
    return updateDevTicketAction(ticket.id, {
      title: ticket.title,
      description: ticket.description ?? "",
      type: ticket.type,
      product: ticket.product,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId ?? "",
      merchantId: ticket.merchantId ?? "",
      [field]: value,
    });
  }

  function sendComment() {
    if (!comment.trim()) return;
    startTransition(async () => {
      const res = await addDevCommentAction(ticket.id, { body: comment });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setComment("");
      router.refresh();
    });
  }

  function upload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await addDevAttachmentAction(ticket.id, fd);
        if (res.error) toast.error(`${file.name}: ${res.error}`);
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const sortedPeople = [...people].sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name) : a.role === "DEVELOPER" ? -1 : 1
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-4">
        {/* Description */}
        {ticket.description ? (
          <div className="rounded-lg border p-3">
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">No description.</p>
        )}

        {/* Attachments */}
        {ticket.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ticket.attachments.map((a) =>
              a.contentType.startsWith("image/") ? (
                <a key={a.id} href={`/api/dev-attachments/${a.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/dev-attachments/${a.id}`}
                    alt={a.filename}
                    className="h-28 rounded-lg border object-cover"
                  />
                </a>
              ) : (
                <a
                  key={a.id}
                  href={`/api/dev-attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:underline"
                >
                  <PaperclipIcon className="size-3.5" /> {a.filename}
                </a>
              )
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="text-muted-foreground text-xs file:mr-2 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-xs"
          />
          <Button variant="outline" size="sm" onClick={upload} disabled={pending}>
            <PaperclipIcon className="size-3.5" /> Attach
          </Button>
        </div>

        {/* Comments */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Comments ({ticket.comments.length})</p>
          {ticket.comments.map((c) => (
            <div key={c.id} className="rounded-lg border p-2.5">
              <p className="text-muted-foreground text-xs">
                <span className="text-foreground font-medium">{c.authorName}</span> · {c.at}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ask, answer, or leave a finding…"
              rows={2}
              className="flex-1"
            />
            <Button size="sm" onClick={sendComment} disabled={pending || !comment.trim()}>
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SendIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* History — the in-app notification channel */}
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">History</p>
          {ticket.history.length === 0 ? (
            <p className="text-muted-foreground text-xs">Nothing yet.</p>
          ) : (
            <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
              {ticket.history.map((h) => (
                <li key={h.id}>
                  <span className="text-foreground">{h.actor}</span> {h.line} · {h.at}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Meta rail */}
      <div className="flex h-fit flex-col gap-3 rounded-lg border p-3">
        <MetaSelect
          label="Status"
          value={ticket.status}
          options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          onSave={(v) => moveDevTicketAction(ticket.id, v)}
        />
        <MetaSelect
          label="Assignee"
          value={ticket.assigneeId ?? NONE}
          options={[
            { value: NONE, label: "Unassigned" },
            ...sortedPeople.map((p) => ({
              value: p.id,
              label: p.role === "DEVELOPER" ? `${p.name} · dev` : p.name,
            })),
          ]}
          onSave={(v) => patch("assigneeId", v === NONE ? "" : v)}
        />
        <MetaSelect
          label="Type"
          value={ticket.type}
          options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          onSave={(v) => patch("type", v)}
        />
        <MetaSelect
          label="Product"
          value={ticket.product}
          options={Object.entries(PRODUCT_LABELS).map(([value, label]) => ({ value, label }))}
          onSave={(v) => patch("product", v)}
        />
        <MetaSelect
          label="Priority"
          value={ticket.priority}
          options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
          onSave={(v) => patch("priority", v)}
        />
        <MetaSelect
          label="Merchant"
          value={ticket.merchantId ?? NONE}
          options={[
            { value: NONE, label: "No merchant" },
            ...merchants.map((m) => ({ value: m.id, label: m.name })),
          ]}
          onSave={(v) => patch("merchantId", v === NONE ? "" : v)}
        />

        <p className="text-muted-foreground text-xs">
          Reported by {ticket.reporter.name}
          {ticket.merchantId && ticket.merchantName ? (
            <>
              {" · for "}
              <Link href={`/merchants/${ticket.merchantId}`} className="text-primary hover:underline">
                {ticket.merchantName}
              </Link>
            </>
          ) : null}
        </p>

        {ticket.canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive justify-start"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete PERX-${ticket.number}? Use "Won't do" to close instead.`)) return;
              startTransition(async () => {
                const res = await deleteDevTicketAction(ticket.id);
                if (res.error) toast.error(res.error);
                else router.push("/dev");
              });
            }}
          >
            <Trash2Icon className="size-3.5" /> Delete ticket
          </Button>
        ) : null}
      </div>
    </div>
  );
}
