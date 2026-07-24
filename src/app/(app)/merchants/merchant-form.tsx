"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

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

export function MerchantForm({
  action,
  defaultValues,
  owners,
  showOwnerSelect,
  defaultOwnerId,
  categoryOptions,
  planOptions,
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
                <Label htmlFor="branches">Number of branches</Label>
                <Input
                  id="branches"
                  name="branches"
                  type="number"
                  min={0}
                  placeholder="e.g. 3"
                  defaultValue={seed("branches")}
                />
                <FieldError message={errors.branches} />
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

          <div className="border-t pt-5">
            <p className="mb-1 text-sm font-medium">Location</p>
            <p className="text-muted-foreground mb-4 text-xs">
              Sets the merchant&apos;s pin on the map. Onboarded merchants show green.
            </p>
            <LocationPicker
              defaultLat={defaultValues?.latitude}
              defaultLng={defaultValues?.longitude}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={seed("notes")} />
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
