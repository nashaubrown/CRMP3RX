import { BottomNav } from "@/components/layout/bottom-nav";
import { Topbar } from "@/components/layout/topbar";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pref = await db.user.findUnique({
    where: { id: user.id },
    select: { generativeUi: true },
  });

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-svh flex-col">
      <Topbar
        user={{ name: user.name, email: user.email, role: user.role }}
        generativeUi={pref?.generativeUi ?? false}
        onSignOut={handleSignOut}
      />
      {/* pb clears the fixed bottom nav */}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
