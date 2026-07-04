"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatHours } from "../../../lib/money";
import { EmptyState, PageHeader, Spinner, Stamp } from "../../../components/ui";

interface Submission {
  id: string;
  kind: "SHIFT" | "SCHEDULE" | "LEAVE";
  title: string;
  detail: string;
  status: string;
  managerNote?: string | null;
  when: string; // ISO
  href: string;
}

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");

  useEffect(() => {
    void (async () => {
      const [schedules, leaves, entries] = await Promise.all([
        api<{ schedules: { id: string; periodType: string; periodStart: string; status: string; managerNote: string | null; submittedAt: string; days: { hours: number }[] }[] }>("/api/schedules"),
        api<{ leaves: { id: string; type: string; startDate: string; endDate: string; status: string; managerNote: string | null; createdAt: string }[] }>("/api/leave"),
        api<{ entries: { id: string; date: string; kind: string; hours: number; note: string | null; status: string; managerNote: string | null; clockIn: string }[] }>("/api/time-entries"),
      ]);

      const all: Submission[] = [
        ...entries.entries.map((e) => ({
          id: e.id,
          kind: "SHIFT" as const,
          title: `Clocked shift · ${formatHours(e.hours)}`,
          detail: `${formatDate(e.date)} · ${e.kind === "SCHEDULED" ? "assigned shift" : "extra work"}${e.note ? ` — “${e.note}”` : ""}`,
          status: e.status,
          managerNote: e.managerNote,
          when: e.clockIn,
          href: "/time",
        })),
        ...schedules.schedules.map((s) => ({
          id: s.id,
          kind: "SCHEDULE" as const,
          title: `${s.periodType === "WEEKLY" ? "Weekly" : "Monthly"} schedule · ${formatHours(s.days.reduce((t, d) => t + d.hours, 0))}`,
          detail: `starting ${formatDate(s.periodStart)}`,
          status: s.status,
          managerNote: s.managerNote,
          when: s.submittedAt,
          href: "/schedule",
        })),
        ...leaves.leaves.map((l) => ({
          id: l.id,
          kind: "LEAVE" as const,
          title: l.type === "PAID" ? "Time off" : l.type === "SICK" ? "Sick leave" : "Unpaid leave",
          detail: `${formatDate(l.startDate)}${l.endDate !== l.startDate ? ` – ${formatDate(l.endDate)}` : ""}`,
          status: l.status,
          managerNote: l.managerNote,
          when: l.createdAt,
          href: "/leave",
        })),
      ].sort((a, b) => (a.when < b.when ? 1 : -1));

      setItems(all);
    })();
  }, []);

  const visible = useMemo(
    () => items?.filter((i) => filter === "ALL" || i.status === filter) ?? [],
    [items, filter],
  );

  return (
    <>
      <PageHeader
        title="My Submissions"
        sub="Everything you've sent for approval — shifts, schedules, and leave — with where it stands."
      />

      <div className="rise mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${
              filter === f ? "bg-accent text-white" : "border border-line bg-card text-ink-soft hover:text-ink"
            }`}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {items === null ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here" hint="Submissions matching this filter will appear here." />
      ) : (
        <ul className="rise rise-1 space-y-2">
          {visible.map((s) => (
            <li key={`${s.kind}-${s.id}`}>
              <Link
                href={s.href}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 hover:border-accent"
              >
                <Stamp value={s.status} />
                <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-faint">
                  {s.kind.toLowerCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-ink-soft">
                    {s.detail}
                    {s.managerNote && <> · Manager: “{s.managerNote}”</>}
                  </span>
                </span>
                <span className="font-mono text-[0.62rem] text-ink-faint">
                  {new Date(s.when).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
