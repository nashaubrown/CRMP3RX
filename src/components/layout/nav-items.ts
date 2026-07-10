import {
  CheckSquare,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Sparkles,
  Store,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Merchants", href: "/merchants", icon: Store },
  { title: "Contacts", href: "/contacts", icon: Users },
  { title: "Leads", href: "/leads", icon: Target },
  { title: "Deals", href: "/deals", icon: KanbanSquare },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Templates", href: "/templates", icon: FileText },
  { title: "Ask Perx", href: "/assistant", icon: Sparkles },
  { title: "Settings", href: "/settings", icon: Settings },
];
