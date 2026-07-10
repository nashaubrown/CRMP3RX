"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import type { DealFormState } from "@/app/(app)/deals/actions";
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

export type DealFormValues = {
  title?: string;
  merchantId?: string;
  contactId?: string | null;
  value?: string;
  currency?: string;
  expectedCloseDate?: string | null; // yyyy-mm-dd
  ownerId?: string;
};

const initialState: DealFormState = { error: null };
const NONE = "__none__";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function DealForm({
  action,
  defaultValues,
  merchants,
  contactsByMerchant,
  owners,
  showOwnerSelect,
  cancelHref,
  submitLabel,
}: {
  action: (prev: DealFormState, formData: FormData) => Promise<DealFormState>;
  defaultValues?: DealFormValues;
  merchants: { id: string; name: string }[];
  contactsByMerchant: Record<string, { id: string; name: string }[]>;
  owners: { id: string; name: string }[];
  showOwnerSelect: boolean;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [merchantId, setMerchantId] = React.useState(defaultValues?.merchantId ?? "");
  const [contactId, setContactId] = React.useState(defaultValues?.contactId ?? NONE);
  const errors = state.fieldErrors ?? {};

  const contacts = merchantId ? (contactsByMerchant[merchantId] ?? []) : [];

  return (
    <form action={formAction}>
      <input type="hidden" name="merchantId" value={merchantId} />
      {contactId !== NONE ? <input type="hidden" name="contactId" value={contactId} /> : null}
      <Card>
        <CardContent className="flex flex-col gap-5">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Seagull Café — loyalty rollout"
                defaultValue={defaultValues?.title ?? ""}
                required
              />
              <FieldError message={errors.title} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="merchant">Merchant *</Label>
              <Select
                value={merchantId || undefined}
                onValueChange={(v) => {
                  setMerchantId(v);
                  setContactId(NONE);
                }}
              >
                <SelectTrigger id="merchant" className="w-full">
                  <SelectValue placeholder="Select a merchant" />
                </SelectTrigger>
                <SelectContent>
                  {merchants.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.merchantId} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact">Contact</Label>
              <Select value={contactId} onValueChange={setContactId} disabled={!merchantId}>
                <SelectTrigger id="contact" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No contact</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="value">Value *</Label>
              <Input
                id="value"
                name="value"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.value ?? ""}
                required
              />
              <FieldError message={errors.value} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue={defaultValues?.currency ?? "MVR"}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MVR">MVR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expectedCloseDate">Expected close date</Label>
              <Input
                id="expectedCloseDate"
                name="expectedCloseDate"
                type="date"
                defaultValue={defaultValues?.expectedCloseDate ?? ""}
              />
            </div>

            {showOwnerSelect ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ownerId">Owner</Label>
                <Select name="ownerId" defaultValue={defaultValues?.ownerId ?? owners[0]?.id}>
                  <SelectTrigger id="ownerId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
