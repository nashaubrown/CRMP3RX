import { formatDateTime } from "@/lib/datetime";
import type { SessionUser } from "@/lib/authz";
import { toE164 } from "@/lib/phone";
import { activitySchema } from "@/lib/validators/activity";
import { scheduleMeetingSchema } from "@/lib/validators/meeting";
import { createActivity } from "@/services/activities";
import { assistantToolDefinitions, executeAssistantTool } from "@/services/assistant-tools";
import { audit } from "@/services/audit";
import { scheduleMeeting } from "@/services/scheduling";

// Tool surface for the MCP endpoint (/api/mcp). Reuses the read-only
// assistant tools and adds two write tools. Everything runs as the API key's
// owner through the services layer, so RBAC scoping and edit-rights gates
// apply exactly as in the web app, and every call is audit-logged.

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const writeToolDefinitions: McpTool[] = [
  {
    name: "log_activity",
    description:
      "Log a note, call, task or meeting on a merchant, contact or deal timeline. Requires edit access to the underlying merchant.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", enum: ["MERCHANT", "CONTACT", "DEAL"] },
        entityId: { type: "string" },
        type: { type: "string", enum: ["NOTE", "CALL", "EMAIL", "SMS", "MEETING", "TASK"] },
        subject: { type: "string" },
        body: { type: "string", description: "Optional details" },
        dueAt: {
          type: "string",
          description: "Optional due date-time in Maldives time, format YYYY-MM-DDTHH:mm",
        },
      },
      required: ["entityType", "entityId", "type", "subject"],
    },
  },
  {
    name: "schedule_meeting",
    description:
      "Schedule a meeting under a merchant or contact, hosted by the current user. It appears on the record's timeline and syncs to the host's Google Calendar (with a Meet link) when connected. The attendee is invited by email.",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", enum: ["MERCHANT", "CONTACT"] },
        entityId: { type: "string" },
        title: { type: "string" },
        attendeeName: { type: "string" },
        attendeeEmail: { type: "string" },
        attendeePhone: { type: "string", description: "Optional, for an SMS invite" },
        startAtLocal: {
          type: "string",
          description: "Start in Maldives time, format YYYY-MM-DDTHH:mm",
        },
        durationMins: { type: "integer", description: "15–240, default 30" },
        notes: { type: "string" },
      },
      required: ["entityType", "entityId", "title", "attendeeName", "attendeeEmail", "startAtLocal"],
    },
  },
];

export function listMcpTools(): McpTool[] {
  return [
    ...assistantToolDefinitions.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.input_schema as Record<string, unknown>,
    })),
    ...writeToolDefinitions,
  ];
}

async function logActivityTool(ctx: SessionUser, input: Record<string, unknown>) {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const activity = await createActivity(ctx, parsed.data);
  return {
    activity_id: activity.id,
    type: activity.type,
    subject: activity.subject,
    due: activity.dueAt ? formatDateTime(activity.dueAt) : null,
  };
}

async function scheduleMeetingTool(ctx: SessionUser, input: Record<string, unknown>) {
  const parsed = scheduleMeetingSchema.safeParse({ durationMins: 30, ...input });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let phone: string | undefined;
  if (parsed.data.attendeePhone) {
    const e164 = toE164(parsed.data.attendeePhone);
    if (!e164) return { error: "Invalid phone number" };
    phone = e164;
  }

  const meeting = await scheduleMeeting(ctx, { ...parsed.data, attendeePhone: phone });
  return {
    meeting_id: meeting.id,
    title: meeting.title,
    starts: formatDateTime(meeting.startAt),
    ends: formatDateTime(meeting.endAt),
    meet_url: meeting.googleMeetUrl,
  };
}

// Returns the tool result as a string (JSON), mirroring executeAssistantTool.
export async function executeMcpTool(
  ctx: SessionUser,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name === "log_activity" || name === "schedule_meeting") {
    await audit({
      actorId: ctx.id,
      action: "mcp.tool_call",
      entityType: "ASSISTANT",
      entityId: name,
      diff: { tool: name, input },
    });
    try {
      const result =
        name === "log_activity"
          ? await logActivityTool(ctx, input)
          : await scheduleMeetingTool(ctx, input);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" });
    }
  }
  // Read tools are shared with Ask Perx (which audit-logs each call).
  return executeAssistantTool(ctx, name, input);
}
