import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { BookingWidget, type DaySlots } from "./booking-widget";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_TIMEZONE } from "@/lib/datetime";
import {
  BOOKING_WINDOW_DAYS,
  getAvailableSlots,
  getBookingHost,
} from "@/services/scheduling";

export const metadata: Metadata = { title: "Book a meeting" };

// Public Calendly-style booking page.
export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = await getBookingHost(slug);
  if (!host || !host.availability) notFound();

  const slots = await getAvailableSlots(host.id);

  const now = new Date();
  const days: DaySlots[] = [];
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i++) {
    const date = addDays(now, i);
    const day = formatInTimeZone(date, APP_TIMEZONE, "yyyy-MM-dd");
    days.push({
      day,
      label: formatInTimeZone(date, APP_TIMEZONE, "EEE d MMM"),
      slots: slots
        .filter((s) => formatInTimeZone(s.startAt, APP_TIMEZONE, "yyyy-MM-dd") === day)
        .map((s) => ({
          iso: s.startAt.toISOString(),
          label: formatInTimeZone(s.startAt, APP_TIMEZONE, "HH:mm"),
        })),
    });
  }

  return (
    <div className="bg-muted/40 flex min-h-svh items-start justify-center p-4 sm:items-center">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-10 items-center justify-center rounded-lg text-lg font-bold">
            P
          </div>
          <CardTitle className="text-xl">Book a meeting with {host.name}</CardTitle>
          <CardDescription>
            Perx Technologies · {host.availability.slotDurationMins}-minute meeting · times shown
            in Maldives time (UTC+5)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingWidget slug={slug} days={days} />
        </CardContent>
      </Card>
    </div>
  );
}
