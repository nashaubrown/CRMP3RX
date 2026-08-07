import {
  Activity as ActivityIcon,
  BadgePercent,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  MapPinned,
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
  { title: "Affiliates", href: "/affiliates", icon: BadgePercent },
  { title: "Zones", href: "/zones", icon: MapPinned },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Meetings", href: "/meetings", icon: CalendarDays },
  { title: "Templates", href: "/templates", icon: FileText },
  { title: "Help Center", href: "/help-center", icon: BookOpen },
  { title: "Ask Perx", href: "/assistant", icon: Sparkles },
  { title: "Activity", href: "/activity", icon: ActivityIcon, adminOnly: true },
  { title: "Team", href: "/team", icon: UserCog, adminOnly: true },
  { title: "Settings", href: "/settings", icon: Settings },
];

// Nav destinations visible to the given role (admins see everything).
export function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? navItems : navItems.filter((i) => !i.adminOnly);
}

// The destinations a rep opens daily — these sit directly in the desktop
// header; everything else lives behind "More". Order here is the order shown.
export const PRIMARY_HREFS = [
  "/dashboard",
  "/merchants",
  "/contacts",
  "/deals",
  "/tasks",
  "/meetings",
];

// Splits the visible destinations into the header row and the More menu.
export function splitNav(isAdmin: boolean): { primary: NavItem[]; overflow: NavItem[] } {
  const items = navItemsFor(isAdmin);
  const primary = PRIMARY_HREFS.map((h) => items.find((i) => i.href === h)).filter(
    Boolean
  ) as NavItem[];
  const overflow = items.filter((i) => !PRIMARY_HREFS.includes(i.href));
  return { primary, overflow };
}
