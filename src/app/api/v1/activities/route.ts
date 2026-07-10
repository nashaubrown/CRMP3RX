import { apiError, apiJson, isResponse, readJson, requireApiUser } from "@/lib/api";
import { activitySchema } from "@/lib/validators/activity";
import { createActivity } from "@/services/activities";

// Log a note/call/task/meeting on a merchant, contact or deal timeline.
// Requires edit rights on the underlying merchant, same as the web app.
export async function POST(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  const body = await readJson(req);
  if (!body) return apiError(400, "Expected a JSON body");

  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");

  try {
    const activity = await createActivity(user, parsed.data);
    return apiJson(
      { id: activity.id, type: activity.type, subject: activity.subject, dueAt: activity.dueAt },
      201
    );
  } catch (e) {
    return apiError(400, e instanceof Error ? e.message : "Something went wrong");
  }
}
