"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, eachDate, formatDate, mondayOf, monthRange, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { useToast } from "../../../components/toast";
import { Button, Card, EmptyState, PageHeader, Spinner, Stamp } from "../../../components/ui";

interface ScheduleDay {
  id?: string;
  date: string;
  hours: number;
}
interface Schedule {
  id: string;
  periodType: "WEEKLY" | "MONTHLY";
  periodStart: string;
  status: string;
  managerNote: string | null;
  submittedAt: string;
  days: ScheduleDay[];
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SchedulePage() {
  const toast = useToast();
  const [periodType, setPeriodType] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [weekStart, setWeekStart] = useState(() => mondayOf(addDays(todayStr(), 7)));
  const [month, setMonth] = useState(() => addDays(todayStr(), 28).slice(0, 7));
  const [hours, setHours] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Schedule[] | null>(null);
  const [busy, setBusy] = useState(false);

  const periodStart = periodType === "WEEKLY" ? weekStart : `${month}-01`;
  const dates = useMemo(
    () =>
      periodType === "WEEKLY"
        ? eachDate(weekStart, addDays(weekStart, 6))
        : eachDate(...monthRange(month)),
    [periodType, weekStart, month],
  );

  const load = useCallback(async () => {
    const data = await api<{ schedules: Schedule[] }>("/api/schedules");
    setHistory(data.schedules);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live (non-superseded, non-rejected) schedule for the selected period.
  const existing = useMemo(
    () =>
      history?.find(
        (s) =>
          s.periodType === periodType &&
          s.periodStart === periodStart &&
          (s.status === "PENDING" || s.status === "APPROVED"),
      ),
    [history, periodType, periodStart],
  );

  useEffect(() => {
    if (existing) {
      setHours(Object.fromEntries(existing.days.map((d) => [d.date, d.hours])));
    } else {
      setHours({});
    }
  }, [existing, periodStart]);

  const total = dates.reduce((s, d) => s + (hours[d] || 0), 0);

  function setDay(date: string, value: string) {
    const n = value === "" ? 0 : Number(value);
    if (Number.isNaN(n) || n < 0 || n > 24) return;
    setHours((h) => ({ ...h, [date]: n }));
  }

  function standardWeek() {
    setHours(
      Object.fromEntries(
        dates.map((d) => {
          const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
          return [d, dow === 0 || dow === 6 ? 0 : 8];
        }),
      ),
    );
  }

  async function submit() {
    setBusy(true);
    try {
      await api("/api/schedules", {
        body: {
          periodType,
          periodStart,
          days: dates.map((date) => ({ date, hours: hours[date] || 0 })),
        },
      });
      toast("success", "Schedule submitted for approval");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  function loadFrom(s: Schedule) {
    setPeriodType(s.periodType);
    if (s.periodType === "WEEKLY") setWeekStart(s.periodStart);
    else setMonth(s.periodStart.slice(0, 7));
    setHours(Object.fromEntries(s.days.map((d) => [d.date, d.hours])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <PageHeader
        title="My Schedule"
        sub="Set your working hours — your manager approves each period."
      />

      <Card
        className="rise rise-1"
        title={
          periodType === "WEEKLY"
            ? `Week of ${formatDate(weekStart)}`
            : `Month of ${formatDate(`${month}-01`).slice(0, 3)} ${month.slice(0, 4)}`
        }
        actions={
          <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
            {(["WEEKLY", "MONTHLY"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPeriodType(t)}
                className={`cursor-pointer rounded px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wide ${
                  periodType === t ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.toLowerCase()}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {periodType === "WEEKLY" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                ‹ Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(todayStr()))}>
                This week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next ›
              </Button>
            </>
          ) : (
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-md border border-line bg-card px-3 py-1.5 text-sm"
              aria-label="Schedule month"
            />
          )}
          <span className="mx-2 h-5 w-px bg-line" />
          <Button variant="outline" size="sm" onClick={standardWeek}>
            Standard 8h weekdays
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHours({})}>
            Clear
          </Button>
          {existing && (
            <span className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
              Current: <Stamp value={existing.status} />
              {existing.status === "APPROVED" && " — editing requires re-approval"}
            </span>
          )}
        </div>

        <div
          className={`grid gap-1.5 ${periodType === "WEEKLY" ? "grid-cols-7" : "grid-cols-4 sm:grid-cols-7"}`}
        >
          {periodType === "MONTHLY" &&
            WEEKDAY.map((w) => (
              <div
                key={w}
                className="hidden text-center font-mono text-[0.6rem] uppercase text-ink-faint sm:block"
              >
                {w}
              </div>
            ))}
          {periodType === "MONTHLY" &&
            Array.from({
              length: (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7,
            }).map((_, i) => <div key={`pad-${i}`} className="hidden sm:block" />)}

          {dates.map((date) => {
            const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
            const weekend = dow === 0 || dow === 6;
            return (
              <label
                key={date}
                className={`rounded-md border px-1.5 py-2 text-center ${
                  weekend ? "border-line-soft bg-paper" : "border-line bg-card"
                }`}
              >
                <span className="block font-mono text-[0.6rem] uppercase text-ink-faint">
                  {periodType === "WEEKLY" ? WEEKDAY[(dow + 6) % 7] : date.slice(8)}
                  {periodType === "WEEKLY" && ` ${date.slice(8)}`}
                </span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={hours[date] ?? ""}
                  placeholder="0"
                  onChange={(e) => setDay(date, e.target.value)}
                  aria-label={`Hours on ${formatDate(date)}`}
                  className="tnum mt-1 w-full rounded border-0 bg-transparent text-center text-sm font-semibold focus:bg-accent-soft"
                />
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <div className="text-sm text-ink-soft">
            Total: <span className="tnum font-display text-lg font-semibold text-ink">{total}h</span>
          </div>
          <Button onClick={submit} disabled={busy || total === 0}>
            {busy ? "Submitting…" : existing ? "Resubmit for approval" : "Submit for approval"}
          </Button>
        </div>
      </Card>

      <h2 className="rise rise-2 mb-3 mt-8 font-display text-xl font-semibold">History</h2>
      {history === null ? (
        <Spinner />
      ) : history.length === 0 ? (
        <EmptyState title="No schedules yet" hint="Submit your first schedule above." />
      ) : (
        <ul className="rise rise-3 space-y-2">
          {history.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3"
            >
              <Stamp value={s.status} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {s.periodType === "WEEKLY" ? "Week of" : "Month of"} {formatDate(s.periodStart)}
                </div>
                <div className="text-xs text-ink-soft">
                  {s.days.reduce((t, d) => t + d.hours, 0)}h across {s.days.length} day(s)
                  {s.managerNote && <> · “{s.managerNote}”</>}
                </div>
              </div>
              {(s.status === "REJECTED" || s.status === "APPROVED") && (
                <Button variant="outline" size="sm" onClick={() => loadFrom(s)}>
                  Edit & resubmit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
