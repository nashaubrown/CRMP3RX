"use client";

import * as React from "react";
import type { EntityType } from "@prisma/client";
import { Loader2Icon, MailIcon, MessageSquareIcon } from "lucide-react";
import { toast } from "sonner";

import { sendEmailAction, sendSmsAction } from "@/app/(app)/_actions/messaging";
import { renderTemplate } from "@/lib/merge-vars";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";

export type ComposeTemplate = {
  id: string;
  name: string;
  channel: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
};

export type Recipient = { label: string; value: string };

const CUSTOM = "__custom__";
const NO_TEMPLATE = "__none__";

function RecipientPicker({
  id,
  options,
  value,
  custom,
  onValueChange,
  onCustomChange,
  placeholder,
}: {
  id: string;
  options: Recipient[];
  value: string;
  custom: string;
  onValueChange: (v: string) => void;
  onCustomChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.length > 0 ? (
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM}>Other…</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      {options.length === 0 || value === CUSTOM ? (
        <Input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Custom recipient"
        />
      ) : null}
    </div>
  );
}

export function ComposeButtons({
  entityType,
  entityId,
  revalidatePath,
  emails,
  phones,
  templates,
  mergeVars,
}: {
  entityType: EntityType;
  entityId: string;
  revalidatePath: string;
  emails: Recipient[];
  phones: Recipient[];
  templates: ComposeTemplate[];
  mergeVars: Record<string, string>;
}) {
  return (
    <>
      <ComposeEmailDialog
        entityType={entityType}
        entityId={entityId}
        revalidatePath={revalidatePath}
        emails={emails}
        templates={templates.filter((t) => t.channel === "EMAIL")}
        mergeVars={mergeVars}
      />
      <ComposeSmsDialog
        entityType={entityType}
        entityId={entityId}
        revalidatePath={revalidatePath}
        phones={phones}
        templates={templates.filter((t) => t.channel === "SMS")}
        mergeVars={mergeVars}
      />
    </>
  );
}

function ComposeEmailDialog({
  entityType,
  entityId,
  revalidatePath,
  emails,
  templates,
  mergeVars,
}: {
  entityType: EntityType;
  entityId: string;
  revalidatePath: string;
  emails: Recipient[];
  templates: ComposeTemplate[];
  mergeVars: Record<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(emails[0]?.value ?? CUSTOM);
  const [customTo, setCustomTo] = React.useState("");
  const [templateId, setTemplateId] = React.useState(NO_TEMPLATE);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) {
      setSubject(renderTemplate(template.subject ?? "", mergeVars));
      // Strip HTML tags into editable plain text (line breaks preserved)
      const text = template.body
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "");
      setBody(renderTemplate(text, mergeVars));
    }
  }

  function send() {
    const recipient = to === CUSTOM ? customTo : to;
    startTransition(async () => {
      const result = await sendEmailAction({
        to: recipient,
        subject,
        body,
        templateId: templateId === NO_TEMPLATE ? undefined : templateId,
        entityType,
        entityId,
        revalidate: revalidatePath,
      });
      if (result.error) setError(result.error);
      else {
        toast.success("Email sent");
        setOpen(false);
        setSubject("");
        setBody("");
        setTemplateId(NO_TEMPLATE);
        setError(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MailIcon /> Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Sent via {process.env.NEXT_PUBLIC_APP_URL ? "Perx CRM" : "Perx CRM"} and logged on
            this record.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-to">To</Label>
            <RecipientPicker
              id="email-to"
              options={emails}
              value={to}
              custom={customTo}
              onValueChange={setTo}
              onCustomChange={setCustomTo}
              placeholder="name@example.com"
            />
          </div>
          {templates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email-template">Template</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger id="email-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending || !subject.trim() || !body.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComposeSmsDialog({
  entityType,
  entityId,
  revalidatePath,
  phones,
  templates,
  mergeVars,
}: {
  entityType: EntityType;
  entityId: string;
  revalidatePath: string;
  phones: Recipient[];
  templates: ComposeTemplate[];
  mergeVars: Record<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(phones[0]?.value ?? CUSTOM);
  const [customTo, setCustomTo] = React.useState("");
  const [templateId, setTemplateId] = React.useState(NO_TEMPLATE);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) setBody(renderTemplate(template.body, mergeVars));
  }

  function send() {
    const recipient = to === CUSTOM ? customTo : to;
    startTransition(async () => {
      const result = await sendSmsAction({
        to: recipient,
        body,
        templateId: templateId === NO_TEMPLATE ? undefined : templateId,
        entityType,
        entityId,
        revalidate: revalidatePath,
      });
      if (result.error) setError(result.error);
      else {
        toast.success("SMS sent");
        setOpen(false);
        setBody("");
        setTemplateId(NO_TEMPLATE);
        setError(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageSquareIcon /> SMS
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send SMS</DialogTitle>
          <DialogDescription>
            Opt-outs (STOP) are enforced automatically. Logged on this record.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sms-to">To</Label>
            <RecipientPicker
              id="sms-to"
              options={phones}
              value={to}
              custom={customTo}
              onValueChange={setTo}
              onCustomChange={setCustomTo}
              placeholder="+960 777 1234"
            />
          </div>
          {templates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sms-template">Template</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger id="sms-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sms-body">Message</Label>
            <Textarea
              id="sms-body"
              rows={4}
              maxLength={640}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {body.length}/640 · {Math.max(1, Math.ceil(body.length / 160))} segment
              {body.length > 160 ? "s" : ""}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending || !body.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <MessageSquareIcon />}
            Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
