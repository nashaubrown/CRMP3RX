"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import type { LeadFormState } from "@/app/(app)/leads/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export type LeadFormValues = {
  source?: string;
  status?: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  merchantId?: string | null;
};

const initialState: LeadFormState = { error: null };

const NONE = "__none__";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function LeadForm({
  action,
  defaultValues,
  merchants,
  cancelHref,
  submitLabel,
}: {
  action: (prev: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  defaultValues?: LeadFormValues;
  merchants: { id: string; name: string }[];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [merchantId, setMerchantId] = React.useState(defaultValues?.merchantId ?? NONE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      {merchantId !== NONE ? <input type="hidden" name="merchantId" value={merchantId} /> : null}
      <Card>
        <CardContent className="flex flex-col gap-5">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source">Source</Label>
              <Select name="source" defaultValue={defaultValues?.source ?? "WEBSITE"}>
                <SelectTrigger id="source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="REFERRAL">Referral</SelectItem>
                  <SelectItem value="EVENT">Event</SelectItem>
                  <SelectItem value="COLD_OUTREACH">Cold outreach</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={defaultValues?.status ?? "NEW"}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="CONTACTED">Contacted</SelectItem>
                  <SelectItem value="QUALIFIED">Qualified</SelectItem>
                  <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Contact name</Label>
              <Input id="name" name="name" defaultValue={defaultValues?.name ?? ""} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" defaultValue={defaultValues?.company ?? ""} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} />
              <FieldError message={errors.email} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="+960 777 1234"
                defaultValue={defaultValues?.phone ?? ""}
              />
              <FieldError message={errors.phone} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="merchantLink">Linked merchant (optional)</Label>
              <Select value={merchantId} onValueChange={setMerchantId}>
                <SelectTrigger id="merchantLink" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {merchants.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Linking a known merchant improves the score (uses its transaction volume).
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message">Message / notes</Label>
            <Textarea id="message" name="message" rows={3} defaultValue={defaultValues?.message ?? ""} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
