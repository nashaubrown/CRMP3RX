import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

// Create / update a task. dueAt is a datetime-local string (Maldives time),
// converted in the service. Links are optional ids.
export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: optionalTrimmed,
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  dueAt: optionalTrimmed,
  assigneeId: optionalTrimmed,
  merchantId: optionalTrimmed,
  contactId: optionalTrimmed,
  dealId: optionalTrimmed,
});

export type TaskInput = z.infer<typeof taskSchema>;

export const taskListParamsSchema = z.object({
  scope: z.enum(["mine", "all"]).default("all"),
  status: z.enum(["open", "done", "all", ...TASK_STATUSES]).default("open"),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: z.string().trim().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  view: z.enum(["list", "board"]).default("list"),
  group: z.enum(["due", "assignee"]).default("due"),
});

export type TaskListParams = z.infer<typeof taskListParamsSchema>;
