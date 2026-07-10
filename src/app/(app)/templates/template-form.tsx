"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import type { TemplateFormState } from "@/app/(app)/templates/actions";
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

const initialState: TemplateFormState = { error: null };

export function TemplateForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>;
  defaultValues?: { name?: string; channel?: string; subject?: string | null; body?: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [channel, setChannel] = React.useState(defaultValues?.channel ?? "EMAIL");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <input type="hidden" name="channel" value={channel} />
      <Card>
        <CardContent className="flex flex-col gap-5">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={defaultValues?.name ?? ""} required />
              {errors.name ? <p className="text-destructive text-xs">{errors.name}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channelSel">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="channelSel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {channel === "EMAIL" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Subject *</Label>
              <Input id="subject" name="subject" defaultValue={defaultValues?.subject ?? ""} />
              {errors.subject ? (
                <p className="text-destructive text-xs">{errors.subject}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body">Body *</Label>
            <Textarea
              id="body"
              name="body"
              rows={8}
              defaultValue={defaultValues?.body ?? ""}
              required
            />
            {errors.body ? <p className="text-destructive text-xs">{errors.body}</p> : null}
            <p className="text-muted-foreground text-xs">
              Merge vars: {"{{merchant_name}}"}, {"{{contact_first_name}}"},{" "}
              {"{{contact_last_name}}"}, {"{{sender_name}}"}, {"{{deal_title}}"},{" "}
              {"{{deal_value}}"}. Email bodies may contain HTML.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/templates">Cancel</Link>
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
