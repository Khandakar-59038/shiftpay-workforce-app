"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/client";
import { Button, EmptyState, PageHeader, Spinner } from "../../../components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const data = await api<{ notifications: Notification[]; unreadCount: number }>(
      "/api/notifications",
    );
    setItems(data.notifications);
    setUnread(data.unreadCount);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Notifications"
        sub="Approvals, alerts, and payments — everything the ledger recorded for you."
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                await api("/api/notifications/read", { body: { all: true } });
                await load();
              }}
            >
              Mark all read ({unread})
            </Button>
          )
        }
      />

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="You'll see schedule, leave, and payment updates here." />
      ) : (
        <ul className="rise space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href ?? "#"}
                className={`block rounded-lg border bg-card px-4 py-3 transition-colors hover:border-accent ${
                  n.readAt ? "border-line opacity-70" : "border-accent/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-accent" />}
                  <span className="text-sm font-semibold">{n.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[0.62rem] uppercase text-ink-faint">
                    {new Date(n.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
