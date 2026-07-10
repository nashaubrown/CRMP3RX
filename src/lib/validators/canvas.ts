import { z } from "zod";

// The "view spec" is the contract between the model and the renderer. The
// model can only emit shapes that pass these schemas; the client renders them
// with a fixed component registry (no arbitrary HTML/JS). Sizes are capped so
// a runaway model can't produce an enormous payload.

// Internal navigation only — blocks javascript:/data:/external URLs an AI
// might emit. Returns null for anything not a safe in-app path.
export function safeInternalHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const h = href.trim();
  // Must be a single-slash-rooted path (not "//host", not a scheme).
  if (!/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/.test(h)) return null;
  return h;
}

const hrefSchema = z
  .string()
  .transform((v, ctx) => {
    const safe = safeInternalHref(v);
    if (!safe) {
      ctx.addIssue({ code: "custom", message: "Only internal links are allowed" });
      return z.NEVER;
    }
    return safe;
  });

const toneEnum = z.enum(["default", "positive", "warning", "danger", "info"]);

// ---------- Actions ----------
// A read action ("link") navigates; write actions re-validate server-side.
export const canvasActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("link"),
    label: z.string().trim().min(1).max(60),
    href: hrefSchema,
  }),
  z.object({
    kind: z.literal("log_activity"),
    label: z.string().trim().min(1).max(60),
    entityType: z.enum(["MERCHANT", "CONTACT", "DEAL"]),
    entityId: z.string().min(1).max(60),
    activityType: z.enum(["NOTE", "CALL", "TASK", "MEETING"]).default("NOTE"),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("complete_task"),
    label: z.string().trim().min(1).max(60),
    activityId: z.string().min(1).max(60),
  }),
]);

export type CanvasAction = z.infer<typeof canvasActionSchema>;

const actionsArray = z.array(canvasActionSchema).max(4).optional();

// ---------- Blocks ----------
const statSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.union([z.string(), z.number()]).transform((v) => String(v)),
  sublabel: z.string().trim().max(80).optional(),
  tone: toneEnum.optional(),
});

const cardFieldSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v)),
});

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal("stat_group"),
    stats: z.array(statSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal("table"),
    caption: z.string().trim().max(120).optional(),
    columns: z.array(z.object({ key: z.string().min(1).max(40), label: z.string().max(60) })).min(1).max(8),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(50),
  }),
  z.object({
    type: z.literal("list"),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(160),
          subtitle: z.string().trim().max(200).optional(),
          badge: z.string().trim().max(40).optional(),
          tone: toneEnum.optional(),
          href: hrefSchema.optional(),
        })
      )
      .max(50),
  }),
  z.object({
    type: z.literal("bar_chart"),
    title: z.string().trim().max(120).optional(),
    bars: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          value: z.number(),
          display: z.string().trim().max(40).optional(),
        })
      )
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("record_card"),
    kind: z.enum(["merchant", "contact", "deal", "lead"]),
    name: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(200).optional(),
    href: hrefSchema.optional(),
    fields: z.array(cardFieldSchema).max(12).optional(),
    actions: actionsArray,
  }),
  z.object({
    type: z.literal("actions"),
    title: z.string().trim().max(120).optional(),
    actions: z.array(canvasActionSchema).min(1).max(6),
  }),
]);

export type CanvasBlock = z.infer<typeof blockSchema>;

export const viewSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(600).optional(),
  blocks: z.array(blockSchema).min(1).max(20),
});

export type ViewSpec = z.infer<typeof viewSpecSchema>;
