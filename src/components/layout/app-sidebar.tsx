import Link from "next/link";

import { SidebarNav } from "@/components/layout/sidebar-nav";

export function AppSidebar() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-60 shrink-0 flex-col border-r md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold">
            P
          </span>
          Perx CRM
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav />
      </div>
    </aside>
  );
}
