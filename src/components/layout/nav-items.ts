import {
  Activity as ActivityIcon,
  Bug,
  Rocket,
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
  /** Sidebar section this destination belongs to. */
  group: NavGroupId;
};

export const NAV_GROUPS = [
  { id: "selling", label: "Selling" },
  { id: "onboarding", label: "Onboarding" },
  { id: "field", label: "Field work" },
  { id: "content", label: "Content" },
  { id: "product", label: "Product" },
  { id: "intelligence", label: "Intelligence" },
  // Not "Admin": Settings lives here and every rep has it. Activity and Team
  // are the admin-only rows inside it.
  { id: "admin", label: "Workspace" },
] as const;

export type NavGroupId = (typeof NAV_GROUPS)[number]["id"];

// Order here is the order shown — in the sidebar, in the mobile "More" sheet,
// and in the command palette.
export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "selling" },
  { title: "Merchants", href: "/merchants", icon: Store, group: "selling" },
  { title: "Contacts", href: "/contacts", icon: Users, group: "selling" },
  { title: "Leads", href: "/leads", icon: Target, group: "selling" },
  { title: "Deals", href: "/deals", icon: KanbanSquare, group: "selling" },
  { title: "Affiliates", href: "/affiliates", icon: BadgePercent, group: "selling" },
  { title: "Zones", href: "/zones", icon: MapPinned, group: "field" },
  { title: "Tasks", href: "/tasks", icon: CheckSquare, group: "field" },
  { title: "Meetings", href: "/meetings", icon: CalendarDays, group: "field" },
  { title: "Templates", href: "/templates", icon: FileText, group: "content" },
  { title: "Help Center", href: "/help-center", icon: BookOpen, group: "content" },
  { title: "Canvas", href: "/canvas", icon: WandSparkles, group: "content" },
  { title: "Dev", href: "/dev", icon: Bug, group: "product" },
  { title: "Roadmap", href: "/roadmap", icon: Rocket, group: "product" },
  { title: "Ask Perx", href: "/assistant", icon: Sparkles, group: "intelligence" },
  { title: "Activity", href: "/activity", icon: ActivityIcon, adminOnly: true, group: "admin" },
  { title: "Team", href: "/team", icon: UserCog, adminOnly: true, group: "admin" },
  { title: "Settings", href: "/settings", icon: Settings, group: "admin" },
];

// Nav destinations visible to the given role (admins see everything).
export function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? navItems : navItems.filter((i) => !i.adminOnly);
}

export type NavSection = { id: NavGroupId; label: string; items: NavItem[] };

// The sidebar's sections, in order, with empty ones dropped — a rep never sees
// an "Admin" heading with nothing under it.
export function navSectionsFor(isAdmin: boolean): NavSection[] {
  const items = navItemsFor(isAdmin);
  return NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: items.filter((i) => i.group === g.id),
  })).filter((s) => s.items.length > 0);
}

