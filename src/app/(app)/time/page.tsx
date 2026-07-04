"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../../components/toast";
import { addDays, formatDate, mondayOf, monthRange, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatHours } from "../../../lib/money";
import { Icon } from "../../../components/icons";
import { Button, Card, PageHeader, Spinner, Stamp, StatCard } from "../../../components/ui";

interface DayRow {
  date: string;
  scheduled: number;
  adjustment: number;
  worked: number;
  onLeave: "PAID" | "SICK" | "UNPAID" | null;
}
interface Summary {
  byDate: DayRow[];
  weeks: { weekKey: string; hours: number }[];
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
}

function presets() {
  const today = todayStr();
  const thisMonday = mondayOf(today);
  const [monthFrom, monthTo] = monthRange(today.slice(0, 7));
  const lastMonth = addDays(monthFrom, -1).slice(0, 7);
  const [lastMonthFrom, lastMonthTo] = monthRange(lastMonth);
  return [
    { label: "This week", from: thisMonday, to: addDays(thisMonday, 6) },
    { label: "Last week", from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) },
    { label: "This month", from: monthFrom, to: monthTo },
    { label: "Last month", from: lastMonthFrom, to: lastMonthTo },
  ];
}

export default function TimePage() {
  const toast = useToast();
  const ranges = useMemo(presets, []);
  const [range, setRange] = useState({ from: ranges[0].from, to: ranges[0].to });
  const [locks, setLocks] = useState<{ weekStart: string }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [limit, setLimit] = useState(40);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSummary(null);
    setError(null);
    try {
      const data = await api<{ summary: Summary; settings: { weeklyHourLimit: number } }>(
        `/api/time?from=${range.from}&to=${range.to}`,
      );
      setSummary(data.summary);
      setLimit(data.settings.weeklyHourLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hours");
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLocks = useCallback(async () => {
    const data = await api<{ locks: { weekStart: string }[] }>("/api/week-locks");
    setLocks(data.locks);
  }, []);

  useEffect(() => {
    void loadLocks();
  }, [loadLocks]);

  // The range is lockable when it is exactly one Monday-started week, not in the future.
  const weekRange =
    range.from === mondayOf(range.from) && range.to === addDays(range.from, 6) ? range.from : null;
  const lockable = weekRange !== null && weekRange <= mondayOf(todayStr());
  const locked = weekRange !== null && locks.some((l) => l.weekStart === weekRange);

  async function lockWeek() {
    if (!weekRange) return;
    if (!window.confirm("Lock this week's hours? This tells your manager they are final."))
      return;
    try {
      await api("/api/week-locks", { body: { weekStart: weekRange } });
      toast("success", "Week locked — your manager has been notified");
      await loadLocks();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Lock failed");
    }
  }

  const activeDays = summary?.byDate.filter((d) => d.worked > 0 || d.scheduled > 0 || d.onLeave) ?? [];

  return (
    <>
      <PageHeader
        title="Time & Overtime"
        sub="Worked hours from approved schedules, with overtime counted per week."
        actions={
          <>
            {locked && <Stamp value="LOCKED" className="mr-1" />}
            {lockable && !locked && (
              <Button variant="outline" size="sm" onClick={lockWeek}>
                Lock this week&apos;s hours
              </Button>
            )}
          <a
            href={`/api/export/timesheet?from=${range.from}&to=${range.to}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
          >
            <Icon name="download" className="size-4" /> CSV
          </a>
          </>
        }
      />

      <div className="rise mb-4 flex flex-wrap items-center gap-2">
        {ranges.map((p) => (
          <button
            key={p.label}
            onClick={() => setRange({ from: p.from, to: p.to })}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${
              range.from === p.from && range.to === p.to
                ? "bg-accent text-white"
                : "border border-line bg-card text-ink-soft hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <label className="flex items-center gap-1 text-xs text-ink-soft">
          From
          <input
            type="date"
            value={range.from}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-ink-soft">
          To
          <input
            type="date"
            value={range.to}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {error && <p className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>}
      {!summary && !error && <Spinner />}

      {summary && (
        <>
          <div className="rise rise-1 grid grid-cols-3 gap-3">
            <StatCard label="Total worked" value={formatHours(summary.totalHours)} />
            <StatCard label="Regular" value={formatHours(summary.regularHours)} />
            <StatCard
              label="Overtime"
              value={formatHours(summary.overtimeHours)}
              tone={summary.overtimeHours > 0 ? "amber" : "ink"}
              hint={`beyond ${limit}h/week`}
            />
          </div>

          {summary.weeks.length > 1 && (
            <Card className="rise rise-2 mt-4" title="By week">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {summary.weeks.map((w) => {
                  const ot = Math.max(0, w.hours - limit);
                  return (
                    <li key={w.weekKey} className="rounded-md border border-line-soft bg-paper px-3 py-2">
                      <div className="font-mono text-[0.65rem] uppercase text-ink-faint">{w.weekKey}</div>
                      <div className="tnum text-lg font-semibold">
                        {formatHours(w.hours)}
                        {ot > 0 && <span className="ml-2 text-sm text-amber">+{formatHours(ot)} OT</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card className="rise rise-3 mt-4" title="Daily ledger">
            {activeDays.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">
                No worked hours in this range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="rule text-left font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
                      <th className="py-2 pr-4 font-semibold">Date</th>
                      <th className="py-2 pr-4 text-right font-semibold">Scheduled</th>
                      <th className="py-2 pr-4 text-right font-semibold">Adjustment</th>
                      <th className="py-2 pr-4 text-right font-semibold">Worked</th>
                      <th className="py-2 font-semibold">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((d) => (
                      <tr key={d.date} className="rule last:border-b-0">
                        <td className="py-2 pr-4">{formatDate(d.date)}</td>
                        <td className="tnum py-2 pr-4 text-right">{d.scheduled || "—"}</td>
                        <td className={`tnum py-2 pr-4 text-right ${d.adjustment ? "text-amber" : ""}`}>
                          {d.adjustment ? (d.adjustment > 0 ? `+${d.adjustment}` : d.adjustment) : "—"}
                        </td>
                        <td className="tnum py-2 pr-4 text-right font-semibold">{d.worked || "—"}</td>
                        <td className="py-2">{d.onLeave && <Stamp value={`${d.onLeave}`} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
