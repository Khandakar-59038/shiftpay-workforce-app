"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { MOBILE_TABS, NAV_SECTIONS } from "./nav-data";

export function Nav({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS[role] ?? NAV_SECTIONS.WORKER;

  return (
    <nav aria-label="Main" className="hidden md:flex md:flex-col md:gap-4">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="mb-1 px-3 font-mono text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-night-text/50">
            {section.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
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
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileTabBar({ role }: { role: string }) {
  const pathname = usePathname();
  const tabs = MOBILE_TABS[role] ?? MOBILE_TABS.WORKER;
  return (
    <nav
      aria-label="Quick navigation"
      className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6rem] font-medium ${
              active ? "text-accent" : "text-ink-soft"
            }`}
          >
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
