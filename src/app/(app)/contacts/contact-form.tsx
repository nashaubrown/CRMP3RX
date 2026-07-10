"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import type { ContactFormState } from "@/app/(app)/contacts/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ContactFormValues = {
  firstName?: string;
  lastName?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  merchantId?: string;
  isPrimary?: boolean;
};

const initialState: ContactFormState = { error: null };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function ContactForm({
  action,
  defaultValues,
  merchants,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  defaultValues?: ContactFormValues;
  merchants: { id: string; name: string }[];
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={defaultValues?.firstName ?? ""}
                required
              />
              <FieldError message={errors.firstName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={defaultValues?.lastName ?? ""}
                required
              />
              <FieldError message={errors.lastName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. General Manager"
                defaultValue={defaultValues?.title ?? ""}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="merchantId">Merchant *</Label>
              <Select name="merchantId" defaultValue={defaultValues?.merchantId}>
                <SelectTrigger id="merchantId" className="w-full">
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

            <div className="flex items-center gap-3 sm:col-span-2">
              <Checkbox
                id="isPrimary"
                name="isPrimary"
                defaultChecked={defaultValues?.isPrimary ?? false}
              />
              <Label htmlFor="isPrimary">Primary contact for this merchant</Label>
            </div>
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
