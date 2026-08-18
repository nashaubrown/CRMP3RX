-- Shared team calendar: one Google calendar carrying every CRM meeting, so
-- teammates see each other's bookings by subscribing once.

CREATE TABLE "CalendarSetting" (
    "id" TEXT NOT NULL,
    "teamCalendarId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSetting_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Meeting" ADD COLUMN "teamEventId" TEXT;
