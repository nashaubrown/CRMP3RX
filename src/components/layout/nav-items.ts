import {
  CheckSquare,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Sparkles,
  Store,
  Target,
  UserCog,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Canvas", href: "/canvas", icon: WandSparkles },
  { title: "Merchants", href: "/merchants", icon: Store },
  { title: "Contacts", href: "/contacts", icon: Users },
  { title: "Leads", href: "/leads", icon: Target },
  { title: "Deals", href: "/deals", icon: KanbanSquare },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Templates", href: "/templates", icon: FileText },
  { title: "Ask Perx", href: "/assistant", icon: Sparkles },
  { title: "Team", href: "/team", icon: UserCog, adminOnly: true },
  { title: "Settings", href: "/settings", icon: Settings },
];

// Nav destinations visible to the given role (admins see everything).
export function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? navItems : navItems.filter((i) => !i.adminOnly);
}
