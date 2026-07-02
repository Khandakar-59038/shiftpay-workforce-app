"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/client";
import { Icon } from "./icons";

interface Notification {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function Bell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const data = await api<{ notifications: Notification[]; unreadCount: number }>(
      "/api/notifications",
    );
    setItems(data.notifications.slice(0, 8));
    setUnread(data.unreadCount);
  }, []);

  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative cursor-pointer rounded-md p-2 text-ink-soft hover:bg-line-soft hover:text-ink"
      >
        <Icon name="bell" className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red font-mono text-[0.55rem] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="rise absolute right-0 z-30 mt-2 w-96 max-w-[90vw] rounded-lg border border-line bg-card shadow-xl">
          <header className="rule flex items-center justify-between px-4 py-2.5">
            <span className="font-display text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                onClick={async () => {
                  await api("/api/notifications/read", { body: { all: true } });
                  void load();
                }}
                className="cursor-pointer font-mono text-[0.65rem] uppercase tracking-wide text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </header>
          <ul className="max-h-96 overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-sm text-ink-faint">Loading…</li>}
            {items?.length === 0 && (
              <li className="px-4 py-6 text-sm text-ink-faint">Nothing here yet.</li>
            )}
            {items?.map((n) => (
              <li key={n.id} className="rule last:border-b-0">
                <Link
                  href={n.href ?? "/notifications"}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-3 hover:bg-line-soft ${n.readAt ? "opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-ink-soft">{n.body}</span>
                </Link>
              </li>
            ))}
          </ul>
          <footer className="rule border-t px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="font-mono text-[0.65rem] uppercase tracking-wide text-accent hover:underline"
            >
              View all
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
