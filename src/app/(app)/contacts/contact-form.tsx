"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, XIcon } from "lucide-react";

import type { ContactFormState } from "@/app/(app)/contacts/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ContactFormValues = {
  firstName?: string;
  lastName?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  merchantIds?: string[];
  isPrimary?: boolean;
};

const initialState: ContactFormState = { error: null };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

// Multi-select over merchants. Selection order is preserved so the first one is
// the contact's "home" merchant. Submits one hidden `merchantIds` input each.
function MerchantMultiSelect({
  merchants,
  defaultSelected,
}: {
  merchants: { id: string; name: string }[];
  defaultSelected: string[];
}) {
  const [selected, setSelected] = React.useState<string[]>(defaultSelected);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const byId = React.useMemo(() => new Map(merchants.map((m) => [m.id, m.name])), [merchants]);
  const filtered = merchants.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {selected.map((id) => (
        <input key={id} type="hidden" name="merchantIds" value={id} />
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-auto min-h-9 w-full justify-between font-normal"
          >
            <span className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">Select merchant(s)</span>
              ) : (
                selected.map((id, i) => (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {i === 0 ? <span className="text-[10px] opacity-70">Home ·</span> : null}
                    {byId.get(id) ?? id}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${byId.get(id) ?? id}`}
                      className="hover:text-destructive ml-0.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          toggle(id);
                        }
                      }}
                    >
                      <XIcon className="size-3" />
                    </span>
                  </Badge>
                ))
              )}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="border-b p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search merchants…"
              className="h-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground p-2 text-sm">No merchants found.</p>
            ) : (
              filtered.map((m) => {
                const checked = selected.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                  >
                    <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                    <span className="flex-1 truncate">{m.name}</span>
                    {checked ? <CheckIcon className="size-4 opacity-60" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-muted-foreground text-xs">
        Tag this contact to one or more merchants. The first is their primary (home) account.
      </p>
    </div>
  );
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

  // React resets uncontrolled inputs after a form action; seed from the echoed
  // values on a failed submit so typed text isn't wiped.
  const submitted = state.values;
  const seed = (name: keyof ContactFormValues, fallback = ""): string => {
    if (submitted && name in submitted) return submitted[name as string] ?? fallback;
    const dv = defaultValues?.[name];
    return dv === null || dv === undefined ? fallback : String(dv);
  };

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
              <Input id="firstName" name="firstName" defaultValue={seed("firstName")} required />
              <FieldError message={errors.firstName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input id="lastName" name="lastName" defaultValue={seed("lastName")} required />
              <FieldError message={errors.lastName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. General Manager"
                defaultValue={seed("title")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Merchant(s) *</Label>
              <MerchantMultiSelect
                merchants={merchants}
                defaultSelected={defaultValues?.merchantIds ?? []}
              />
              <FieldError message={errors.merchantIds} />
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

            <div className="flex items-center gap-3 sm:col-span-2">
              <Checkbox
                id="isPrimary"
                name="isPrimary"
                defaultChecked={
                  submitted ? submitted.isPrimary === "on" : (defaultValues?.isPrimary ?? false)
                }
              />
              <Label htmlFor="isPrimary">Primary contact for the home merchant</Label>
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
