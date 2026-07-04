"use client";

import { useEffect, useState } from "react";
import { formatDate } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatHours } from "../../../lib/money";
import { Icon } from "../../../components/icons";
import { EmptyState, PageHeader, Spinner } from "../../../components/ui";

interface Event {
  id: string;
  icon: string;
  title: string;
  body: string;
  when: string; // ISO
  tone: "accent" | "amber" | "ink";
}

export default function ActivityPage() {
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [notes, entries, locks] = await Promise.all([
        api<{ notifications: { id: string; type: string; title: string; body: string; createdAt: string }[] }>("/api/notifications"),
        api<{ entries: { id: string; date: string; kind: string; hours: number; status: string; clockIn: string; note: string | null }[] }>("/api/time-entries"),
        api<{ locks: { id: string; weekStart: string; createdAt: string }[] }>("/api/week-locks"),
      ]);

      const all: Event[] = [
        // Time clock updates: every completed punch, with its current status.
        ...entries.entries.map((e) => ({
          id: `entry-${e.id}`,
          icon: "clock",
          title: `Clocked ${formatHours(e.hours)} · ${e.status.toLowerCase()}`,
          body: `${formatDate(e.date)} · ${e.kind === "SCHEDULED" ? "assigned shift" : "extra work"}${e.note ? ` — “${e.note}”` : ""}`,
          when: e.clockIn,
          tone: (e.status === "APPROVED" ? "accent" : e.status === "PENDING" ? "amber" : "ink") as Event["tone"],
        })),
        ...locks.locks.map((l) => ({
          id: `lock-${l.id}`,
          icon: "check",
          title: "Locked weekly hours",
          body: `Week of ${formatDate(l.weekStart)} confirmed as final.`,
          when: l.createdAt,
          tone: "accent" as const,
        })),
        ...notes.notifications.map((n) => ({
          id: `note-${n.id}`,
          icon:
            n.type.startsWith("PAYMENT") ? "banknote" :
            n.type.startsWith("LEAVE") ? "leave" :
            n.type.startsWith("TASK") ? "clipboard" :
            n.type.startsWith("TIMESHEET") ? "clock" : "bell",
          title: n.title,
          body: n.body,
          when: n.createdAt,
          tone: "ink" as const,
        })),
      ].sort((a, b) => (a.when < b.when ? 1 : -1));

      setEvents(all.slice(0, 80));
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="My Activity"
        sub="A running record of your shifts, submissions, and everything that reached you."
      />

      {events === null ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState title="No activity yet" hint="Clock a shift or submit a schedule to get started." />
      ) : (
        <ol className="rise relative ml-3 space-y-4 border-l border-line pl-6">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                className={`absolute -left-[2.05rem] top-0.5 flex size-6 items-center justify-center rounded-full border ${
                  e.tone === "accent"
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : e.tone === "amber"
                      ? "border-amber/40 bg-amber-soft text-amber"
                      : "border-line bg-card text-ink-soft"
                }`}
              >
                <Icon name={e.icon} className="size-3" />
              </span>
              <div className="rounded-lg border border-line bg-card px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{e.title}</span>
                  <span className="shrink-0 font-mono text-[0.6rem] uppercase text-ink-faint">
                    {new Date(e.when).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{e.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
