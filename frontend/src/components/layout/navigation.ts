import {
  LayoutDashboard,
  ListTodo,
  BookOpen,
  CalendarDays,
  Flag,
  ChartNoAxesCombined,
  Settings,
  Sparkles,
} from "lucide-react";
export const navigation = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/deadlines", label: "Deadlines", icon: Flag },
  { to: "/progress", label: "Progress", icon: ChartNoAxesCombined },
  { to: "/settings", label: "Settings", icon: Settings },
];
export const mobileNavigation = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
];
