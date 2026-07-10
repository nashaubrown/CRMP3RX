import { apiJson, isResponse, requireApiUser } from "@/lib/api";

// Identify the user behind an API key — useful as a connectivity check.
export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (isResponse(user)) return user;

  return apiJson({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
