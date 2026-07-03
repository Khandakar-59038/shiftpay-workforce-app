"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const NAV: Record<string, { href: string; label: string; icon: string }[]> = {
  WORKER: [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/schedule", label: "My Schedule", icon: "calendar" },
    { href: "/schedule-board", label: "Team Schedule", icon: "users" },
    { href: "/time", label: "Time & Overtime", icon: "clock" },
    { href: "/leave", label: "Leave", icon: "leave" },
    { href: "/pay", label: "Pay", icon: "banknote" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
  ],
  MANAGER: [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/schedule-board", label: "Schedule Board", icon: "calendar" },
    { href: "/approvals", label: "Approvals", icon: "check" },
    { href: "/team-time", label: "Team Time", icon: "clock" },
    { href: "/leave-approvals", label: "Leave Approvals", icon: "leave" },
    { href: "/payroll", label: "Payroll", icon: "banknote" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/settings", label: "Company Settings", icon: "cog" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
  ],
};

export function Nav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = NAV[role] ?? NAV.WORKER;

  return (
    <nav aria-label="Main" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-night-soft font-medium text-white"
                : "text-night-text hover:bg-night-soft/60 hover:text-white"
            }`}
          >
            <Icon name={item.icon} className={`size-4 ${active ? "text-accent-soft" : ""}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
