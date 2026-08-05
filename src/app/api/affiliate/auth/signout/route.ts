import { apiJson } from "@/lib/affiliate-api";
import { signOut } from "@/services/affiliate-portal";

export const dynamic = "force-dynamic";

// Revoke the bearer session (portal sign-out). Always succeeds.
export async function POST(req: Request) {
  await signOut(req);
  return apiJson({ ok: true });
}
