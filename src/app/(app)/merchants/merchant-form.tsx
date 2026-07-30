"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";

import type { MerchantFormState } from "@/app/(app)/merchants/actions";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LocationPicker } from "@/components/maps/location-picker";

export type MerchantFormValues = {
  name?: string;
  category?: string | null;
  status?: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  posSystem?: string | null;
  monthlyTxnVolume?: number | null;
  loyaltyLive?: boolean;
  subscriptionPlan?: string | null;
  branches?: number | null;
  beta?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  ownerId?: string;
  affiliateId?: string | null;
};

const initialState: MerchantFormState = { error: null };

// Sentinel for "no selection" — Radix Select can't use an empty-string value.
const NONE = "__none__";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

// A dropdown over an admin-managed option set. Submits via a hidden input so an
// empty selection posts "" (cleared) rather than a sentinel.
function OptionSelect({
  name,
  options,
  defaultValue,
  placeholder,
}: {
  name: string;
  options: string[];
  defaultValue?: string | null;
  placeholder: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value === "" ? undefined : value} onValueChange={(v) => setValue(v === NONE ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— None —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

// Like OptionSelect but the option value is an id (distinct from its label),
// used for the referring affiliate.
function IdSelect({
  name,
  options,
  defaultValue,
  placeholder,
}: {
  name: string;
  options: { id: string; name: string }[];
  defaultValue?: string | null;
  placeholder: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value === "" ? undefined : value} onValueChange={(v) => setValue(v === NONE ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— None —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

type ContactRow = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

const emptyContact = (): ContactRow => ({
  firstName: "",
  lastName: "",
  title: "",
  email: "",
  phone: "+960 ",
  isPrimary: false,
});

// Optional repeatable contacts, created together with the merchant and tied to
// it. Serializes non-empty rows (those with a name) into a hidden JSON input.
function ContactsEditor() {
  const [rows, setRows] = React.useState<ContactRow[]>([]);

  const update = (i: number, patch: Partial<ContactRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const nonEmpty = rows.filter((r) => r.firstName.trim() || r.lastName.trim());

  return (
    <div className="border-t pt-5">
      <input type="hidden" name="contactsJson" value={JSON.stringify(nonEmpty)} />
      <p className="mb-1 text-sm font-medium">Contacts</p>
      <p className="text-muted-foreground mb-4 text-xs">
        Optional — add people at this merchant and they&apos;ll be tied to it. First and last name
        required for each.
      </p>

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Contact {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive size-6"
                aria-label={`Remove contact ${i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="First name *"
                value={r.firstName}
                onChange={(e) => update(i, { firstName: e.target.value })}
              />
              <Input
                placeholder="Last name *"
                value={r.lastName}
                onChange={(e) => update(i, { lastName: e.target.value })}
              />
              <Input
                placeholder="Title (e.g. General Manager)"
                value={r.title}
                onChange={(e) => update(i, { title: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email"
                value={r.email}
                onChange={(e) => update(i, { email: e.target.value })}
              />
              <Input
                placeholder="+960 777 1234"
                value={r.phone}
                onChange={(e) => update(i, { phone: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={r.isPrimary}
                  onCheckedChange={(v) => update(i, { isPrimary: v === true })}
                />
                Primary contact
              </label>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => setRows((rs) => [...rs, emptyContact()])}
      >
        <PlusIcon /> Add {rows.length > 0 ? "another" : "a"} contact
      </Button>
    </div>
  );
}

// Optional first deal, created with the merchant and opened in the New stage.
// Only submitted when a title is filled in.
function DealEditor() {
  const [title, setTitle] = React.useState("");
  const [value, setValue] = React.useState("");
  const [currency, setCurrency] = React.useState("MVR");
  const [closeDate, setCloseDate] = React.useState("");

  const payload = title.trim()
    ? JSON.stringify({ title, value, currency, expectedCloseDate: closeDate })
    : "";

  return (
    <div className="border-t pt-5">
      <input type="hidden" name="dealJson" value={payload} />
      <p className="mb-1 text-sm font-medium">First deal</p>
      <p className="text-muted-foreground mb-4 text-xs">
        Optional — start a deal for this merchant (opens in the New stage). Title and value required
        if you add one.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="deal-title">Title</Label>
          <Input
            id="deal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Loyalty program rollout"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deal-value">Value</Label>
          <Input
            id="deal-value"
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 25000"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deal-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="deal-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MVR">MVR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deal-close">Expected close</Label>
          <Input
            id="deal-close"
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function MerchantForm({
  action,
  defaultValues,
  owners,
  showOwnerSelect,
  defaultOwnerId,
  categoryOptions,
  planOptions,
  affiliateOptions,
  showContacts = false,
  showDeal = false,
  showLocation = true,
  cancelHref,
  submitLabel,
}: {
  action: (prev: MerchantFormState, formData: FormData) => Promise<MerchantFormState>;
  defaultValues?: MerchantFormValues;
  owners: { id: string; name: string }[];
  showOwnerSelect: boolean;
  defaultOwnerId?: string;
  categoryOptions: string[];
  planOptions: string[];
  affiliateOptions: { id: string; name: string }[];
  showContacts?: boolean;
  showDeal?: boolean;
  showLocation?: boolean;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  // React resets uncontrolled inputs after a form action, so on a failed submit
  // seed each field from the echoed values to preserve what the user typed.
  const submitted = state.values;
  const seed = (name: keyof MerchantFormValues, fallback = ""): string => {
    if (submitted && name in submitted) return submitted[name as string] ?? fallback;
    const dv = defaultValues?.[name];
    return dv === null || dv === undefined ? fallback : String(dv);
  };
  const loyaltyDefault = submitted
    ? submitted.loyaltyLive === "on"
    : (defaultValues?.loyaltyLive ?? false);
  const betaDefault = submitted ? submitted.beta === "on" : (defaultValues?.beta ?? false);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-5">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={seed("name")} required />
              <FieldError message={errors.name} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <OptionSelect
                name="category"
                options={categoryOptions}
                defaultValue={submitted?.category ?? defaultValues?.category}
                placeholder="Select a category"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={defaultValues?.status ?? "PROSPECT"}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROSPECT">Prospect</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CHURNED">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={seed("email")} />
              <FieldError message={errors.email} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="+960 777 1234"
                defaultValue={seed("phone", "+960 ")}
              />
              <FieldError message={errors.phone} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                placeholder="https://…"
                defaultValue={seed("website")}
              />
              <FieldError message={errors.website} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={seed("address")} />
            </div>

            {showOwnerSelect ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ownerId">Owner</Label>
                <Select name="ownerId" defaultValue={defaultValues?.ownerId ?? defaultOwnerId ?? owners[0]?.id}>
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

          <div className="border-t pt-5">
            <p className="mb-4 text-sm font-medium">Perx fields</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="posSystem">POS system</Label>
                <Input
                  id="posSystem"
                  name="posSystem"
                  placeholder="e.g. Ewity"
                  defaultValue={seed("posSystem")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthlyTxnVolume">Monthly transaction volume</Label>
                <Input
                  id="monthlyTxnVolume"
                  name="monthlyTxnVolume"
                  type="number"
                  min={0}
                  defaultValue={seed("monthlyTxnVolume")}
                />
                <FieldError message={errors.monthlyTxnVolume} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="subscriptionPlan">Subscription plan</Label>
                <OptionSelect
                  name="subscriptionPlan"
                  options={planOptions}
                  defaultValue={submitted?.subscriptionPlan ?? defaultValues?.subscriptionPlan}
                  placeholder="Select a plan"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="affiliateId">Referred by (affiliate)</Label>
                <IdSelect
                  name="affiliateId"
                  options={affiliateOptions}
                  defaultValue={submitted?.affiliateId ?? defaultValues?.affiliateId}
                  placeholder={
                    affiliateOptions.length ? "Select an affiliate" : "No affiliates yet"
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="loyaltyLive"
                  name="loyaltyLive"
                  defaultChecked={loyaltyDefault}
                />
                <Label htmlFor="loyaltyLive">Loyalty program live</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="beta" name="beta" defaultChecked={betaDefault} />
                <Label htmlFor="beta">BETA merchant</Label>
              </div>
            </div>
          </div>

          {showLocation ? (
            <div className="border-t pt-5">
              <p className="mb-1 text-sm font-medium">Primary location</p>
              <p className="text-muted-foreground mb-4 text-xs">
                Becomes the merchant&apos;s first outlet (its pin on the map). Add more outlets on the
                merchant page after saving.
              </p>
              <LocationPicker
                defaultLat={defaultValues?.latitude}
                defaultLng={defaultValues?.longitude}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={seed("notes")} />
          </div>

          {showContacts ? <ContactsEditor /> : null}
          {showDeal ? <DealEditor /> : null}

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
