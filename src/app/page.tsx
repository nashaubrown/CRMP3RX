import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";

// Post-login landing honors the user's UI-mode preference.
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/welcome");
  const pref = await db.user.findUnique({
    where: { id: user.id },
    select: { generativeUi: true },
  });
  redirect(pref?.generativeUi ? "/canvas" : "/dashboard");
}
