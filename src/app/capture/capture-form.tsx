"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";

import { captureLeadAction, type CaptureState } from "@/app/capture/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CaptureState = { error: null };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function CaptureForm({ referralCode }: { referralCode?: string | null }) {
  const [state, formAction, pending] = useActionState(captureLeadAction, initialState);
  const errors = state.fieldErrors ?? {};

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2Icon className="size-10 text-emerald-500" />
        <p className="text-lg font-semibold">Thanks — we got it!</p>
        <p className="text-muted-foreground text-sm">
          The Perx team will reach out within one business day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Honeypot — hidden from real users */}
      <div className="hidden" aria-hidden>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* Affiliate attribution (validated server-side on submit) */}
      {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name *</Label>
        <Input id="name" name="name" required />
        <FieldError message={errors.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company">Business name *</Label>
        <Input id="company" name="company" required />
        <FieldError message={errors.company} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
          <FieldError message={errors.email} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+960 777 1234" />
          <FieldError message={errors.phone} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">What are you looking for?</Label>
        <Textarea
          id="message"
          name="message"
          rows={3}
          placeholder="e.g. A loyalty program for my two café outlets in Malé"
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        Request a demo
      </Button>
    </form>
  );
}
