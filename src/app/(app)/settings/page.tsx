import type { Metadata } from "next";
import { CalendarCheckIcon, CalendarIcon } from "lucide-react";

import { disconnectCalendarAction } from "@/app/(app)/settings/actions";
import { AiProviderCard } from "@/app/(app)/settings/ai-provider-card";
import { EmailIdentityCard } from "@/app/(app)/settings/email-identity-card";
import { ApiKeysCard } from "@/app/(app)/settings/api-keys-card";
import { OptionSetsCard } from "@/app/(app)/settings/option-sets-card";
import { RewardLibraryCard } from "@/app/(app)/settings/reward-library-card";
import { listRewardTemplates } from "@/services/rewards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { AI_PROVIDER_OPTIONS, getAiSettings } from "@/services/ai-settings";
import { getEmailSettings } from "@/services/email-settings";
import { listApiKeys } from "@/services/api-keys";
import { isAdmin } from "@/lib/authz";
import { listManagedOptions, listOptions, OPTION_SETS } from "@/services/option-sets";

export const metadata: Metadata = { title: "Settings" };

const CALENDAR_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected!",
  error: "Google Calendar connection failed — please try again.",
  "no-refresh-token":
    "Google didn't return offline access. Remove the app at myaccount.google.com/permissions and reconnect.",
  "not-configured": "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env to enable calendar connect.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const user = await requireUser();
  const { calendar: calendarMsg } = await searchParams;

  const admin = isAdmin(user);
  const [profile, apiKeys, aiSettings, emailSettings, optionSets, rewardTemplates, categories, calendarEventCount] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        calendarAccount: { select: { createdAt: true, lastSyncedAt: true } },
      },
    }),
    listApiKeys(user),
    getAiSettings(user),
    getEmailSettings(user),
    admin
      ? Promise.all(
          OPTION_SETS.map(async (s) => ({
            key: s.key,
            label: s.label,
            description: s.description,
            priced: s.key === "SUBSCRIPTION_PLAN",
            options: (await listManagedOptions(user, s.key)).map((o) => ({
              id: o.id,
              label: o.label,
              archived: o.archived,
              priceMvr: o.priceMvr,
              perLocation: o.perLocation,
            })),
          }))
        )
      : Promise.resolve([]),
    admin ? listRewardTemplates({ includeArchived: true }) : Promise.resolve([]),
    admin ? listOptions("MERCHANT_CATEGORY") : Promise.resolve([]),
    db.calendarEvent.count({ where: { userId: user.id } }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Calendar connection, dropdown values, and API access
        </p>
      </div>

      {calendarMsg && CALENDAR_MESSAGES[calendarMsg] ? (
        <Alert variant={calendarMsg === "connected" ? "default" : "destructive"}>
          <AlertDescription>{CALENDAR_MESSAGES[calendarMsg]}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="size-4" /> Google Calendar
          </CardTitle>
          <CardDescription>
            Two-way. Meetings you schedule in the CRM become Google Calendar events with Meet
            links and invites; anything you book directly in Google appears in Meetings, refreshed
            every 15 minutes. Events you mark private in Google show to teammates as Busy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          {profile?.calendarAccount ? (
            <>
              <div className="flex flex-col gap-1">
                <Badge className="w-fit border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <CalendarCheckIcon className="size-3" /> Connected since{" "}
                  {formatDateTime(profile.calendarAccount.createdAt, "d MMM yyyy")}
                </Badge>
                <p className="text-muted-foreground text-xs">
                  {profile.calendarAccount.lastSyncedAt
                    ? `Last synced ${formatDateTime(profile.calendarAccount.lastSyncedAt)} · ${calendarEventCount} event${calendarEventCount === 1 ? "" : "s"} imported`
                    : "Waiting for the first sync (runs every 15 minutes)"}
                </p>
              </div>
              <form action={disconnectCalendarAction}>
                <Button variant="outline" size="sm" type="submit">
                  Disconnect
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">Not connected</p>
              <Button size="sm" asChild>
                <a href="/api/google/connect">Connect Google Calendar</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {admin ? <OptionSetsCard sets={optionSets} /> : null}
      {admin ? <RewardLibraryCard templates={rewardTemplates} categories={categories} /> : null}


      {aiSettings.isAdmin ? (
        <AiProviderCard
          options={AI_PROVIDER_OPTIONS.map((o) => ({
            value: o.value,
            name: o.name,
            defaultModel: o.defaultModel,
            keyOptional: o.keyOptional,
            custom: o.custom,
            models: o.models,
          }))}
          active={aiSettings.activeProviderLabel}
          source={aiSettings.activeSource}
          configured={aiSettings.configured}
          saved={aiSettings.saved}
        />
      ) : null}

      {emailSettings.isAdmin ? (
        <EmailIdentityCard
          activeFrom={emailSettings.activeFrom}
          source={emailSettings.source}
          saved={emailSettings.saved}
        />
      ) : null}

      <ApiKeysCard
        appUrl={appUrl}
        keys={apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: formatDateTime(k.createdAt, "d MMM yyyy"),
          lastUsedAt: k.lastUsedAt ? formatDateTime(k.lastUsedAt) : null,
        }))}
      />
    </div>
  );
}
