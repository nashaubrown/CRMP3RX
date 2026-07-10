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
  ownerId?: string;
};

const initialState: MerchantFormState = { error: null };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function MerchantForm({
  action,
  defaultValues,
  owners,
  showOwnerSelect,
  cancelHref,
  submitLabel,
}: {
  action: (prev: MerchantFormState, formData: FormData) => Promise<MerchantFormState>;
  defaultValues?: MerchantFormValues;
  owners: { id: string; name: string }[];
  showOwnerSelect: boolean;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

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
              <Input id="name" name="name" defaultValue={defaultValues?.name ?? ""} required />
              <FieldError message={errors.name} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                placeholder="e.g. Restaurants & Cafés"
                defaultValue={defaultValues?.category ?? ""}
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
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={defaultValues?.email ?? ""}
              />
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                placeholder="https://…"
                defaultValue={defaultValues?.website ?? ""}
              />
              <FieldError message={errors.website} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={defaultValues?.address ?? ""} />
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

          <div className="border-t pt-5">
            <p className="mb-4 text-sm font-medium">Perx fields</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="posSystem">POS system</Label>
                <Input
                  id="posSystem"
                  name="posSystem"
                  placeholder="e.g. Ewity"
                  defaultValue={defaultValues?.posSystem ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthlyTxnVolume">Monthly transaction volume</Label>
                <Input
                  id="monthlyTxnVolume"
                  name="monthlyTxnVolume"
                  type="number"
                  min={0}
                  defaultValue={defaultValues?.monthlyTxnVolume ?? ""}
                />
                <FieldError message={errors.monthlyTxnVolume} />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="loyaltyLive"
                  name="loyaltyLive"
                  defaultChecked={defaultValues?.loyaltyLive ?? false}
                />
                <Label htmlFor="loyaltyLive">Loyalty program live</Label>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
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
