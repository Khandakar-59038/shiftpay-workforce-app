export interface NavItem {
  href: string;
  label: string;
  icon: string;
}
export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: Record<string, NavSection[]> = {
  WORKER: [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid" },
        { href: "/schedule", label: "My Schedule", icon: "calendar" },
        { href: "/schedule-board", label: "Team Schedule", icon: "users" },
        { href: "/time", label: "Time & Overtime", icon: "clock" },
        { href: "/tasks", label: "Quick Tasks", icon: "clipboard" },
      ],
    },
    {
      label: "Me",
      items: [
        { href: "/leave", label: "Leave & Time Off", icon: "leave" },
        { href: "/pay", label: "Pay", icon: "banknote" },
        { href: "/submissions", label: "My Submissions", icon: "check" },
        { href: "/activity", label: "My Activity", icon: "pulse" },
        { href: "/profile", label: "Profile", icon: "user" },
      ],
    },
    {
      label: "Company",
      items: [
        { href: "/chat", label: "Chat", icon: "chat" },
        { href: "/support", label: "Support Center", icon: "help" },
        { href: "/notifications", label: "Notifications", icon: "bell" },
      ],
    },
  ],
  MANAGER: [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid" },
        { href: "/schedule-board", label: "Schedule Board", icon: "calendar" },
        { href: "/approvals", label: "Approvals", icon: "check" },
        { href: "/team-time", label: "Team Time", icon: "clock" },
        { href: "/leave-approvals", label: "Leave Approvals", icon: "leave" },
        { href: "/payroll", label: "Payroll", icon: "banknote" },
        { href: "/tasks", label: "Quick Tasks", icon: "clipboard" },
      ],
    },
    {
      label: "Me",
      items: [
        { href: "/activity", label: "My Activity", icon: "pulse" },
        { href: "/profile", label: "Profile", icon: "user" },
      ],
    },
    {
      label: "Company",
      items: [
        { href: "/chat", label: "Chat", icon: "chat" },
        { href: "/support", label: "Support Center", icon: "help" },
        { href: "/notifications", label: "Notifications", icon: "bell" },
      ],
    },
  ],
  ADMIN: [
    {
      label: "Company",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid" },
        { href: "/users", label: "Users", icon: "users" },
        { href: "/settings", label: "Company Settings", icon: "cog" },
        { href: "/tasks", label: "Quick Tasks", icon: "clipboard" },
      ],
    },
    {
      label: "Me",
      items: [
        { href: "/activity", label: "My Activity", icon: "pulse" },
        { href: "/profile", label: "Profile", icon: "user" },
      ],
    },
    {
      label: "Connect",
      items: [
        { href: "/chat", label: "Chat", icon: "chat" },
        { href: "/support", label: "Support Center", icon: "help" },
        { href: "/notifications", label: "Notifications", icon: "bell" },
      ],
    },
  ],
};

/** The five slots on the mobile bottom tab bar (last slot is the full menu). */
export const MOBILE_TABS: Record<string, NavItem[]> = {
  WORKER: [
    { href: "/dashboard", label: "Home", icon: "grid" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/time", label: "Time", icon: "clock" },
    { href: "/chat", label: "Chat", icon: "chat" },
    { href: "/menu", label: "More", icon: "menu" },
  ],
  MANAGER: [
    { href: "/dashboard", label: "Home", icon: "grid" },
    { href: "/schedule-board", label: "Board", icon: "calendar" },
    { href: "/approvals", label: "Approvals", icon: "check" },
    { href: "/chat", label: "Chat", icon: "chat" },
    { href: "/menu", label: "More", icon: "menu" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Home", icon: "grid" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/settings", label: "Settings", icon: "cog" },
    { href: "/chat", label: "Chat", icon: "chat" },
    { href: "/menu", label: "More", icon: "menu" },
  ],
};
