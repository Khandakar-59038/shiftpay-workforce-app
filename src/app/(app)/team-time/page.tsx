"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDays, formatDate, isoWeekKey, mondayOf, monthRange, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatHours } from "../../../lib/money";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/toast";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Stamp,
  StatCard,
  TextArea,
} from "../../../components/ui";

interface Worker {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}
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

export default function TeamTimePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <TeamTime />
    </Suspense>
  );
}

function TeamTime() {
  const toast = useToast();
  const params = useSearchParams();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState(params.get("workerId") ?? "");
  const thisMonday = useMemo(() => mondayOf(todayStr()), []);
  const [range, setRange] = useState({ from: addDays(thisMonday, -14), to: addDays(thisMonday, 6) });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [limit, setLimit] = useState(40);
  const [lockedWeeks, setLockedWeeks] = useState<Set<string>>(new Set());
  const [adjusting, setAdjusting] = useState(false);
  const [adj, setAdj] = useState({ date: todayStr(), deltaHours: "-1", reason: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ users: Worker[] }>("/api/users").then((data) => {
      const active = data.users.filter((u) => u.role === "WORKER" && u.isActive);
      setWorkers(active);
      setWorkerId((id) => id || active[0]?.id || "");
    });
  }, []);

  const load = useCallback(async () => {
    if (!workerId) return;
    setSummary(null);
    const data = await api<{ summary: Summary; settings: { weeklyHourLimit: number } }>(
      `/api/time?from=${range.from}&to=${range.to}&workerId=${workerId}`,
    );
    setSummary(data.summary);
    setLimit(data.settings.weeklyHourLimit);
  }, [workerId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workerId) return;
    void api<{ locks: { weekStart: string }[] }>(`/api/week-locks?workerId=${workerId}`).then(
      (d) => setLockedWeeks(new Set(d.locks.map((l) => isoWeekKey(l.weekStart)))),
    );
  }, [workerId]);

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/time/adjustments", {
        body: {
          workerId,
          date: adj.date,
          deltaHours: Number(adj.deltaHours),
          reason: adj.reason,
        },
      });
      toast("success", "Hours adjusted — the worker has been notified");
      setAdjusting(false);
      setAdj({ date: todayStr(), deltaHours: "-1", reason: "" });
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setBusy(false);
    }
  }

  const worker = workers.find((w) => w.id === workerId);
  const activeDays = summary?.byDate.filter((d) => d.worked > 0 || d.scheduled > 0 || d.adjustment !== 0 || d.onLeave) ?? [];

  return (
    <>
      <PageHeader
        title="Team Time"
        sub="Per-worker hours with overtime flags. Adjust when reality differs from the schedule."
        actions={
          <Button variant="outline" onClick={() => setAdjusting(true)} disabled={!workerId}>
            Adjust hours
          </Button>
        }
      />

      <div className="rise mb-4 flex flex-wrap items-end gap-3">
        <Field label="Worker">
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="min-w-48">
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={range.from}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={range.to}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRange({ from: monthRange(todayStr().slice(0, 7))[0], to: monthRange(todayStr().slice(0, 7))[1] })}
        >
          This month
        </Button>
      </div>

      {!summary ? (
        <Spinner />
      ) : (
        <>
          <div className="rise rise-1 grid grid-cols-3 gap-3">
            <StatCard label="Total worked" value={formatHours(summary.totalHours)} hint={worker?.name} />
            <StatCard label="Regular" value={formatHours(summary.regularHours)} />
            <StatCard
              label="Overtime"
              value={formatHours(summary.overtimeHours)}
              tone={summary.overtimeHours > 0 ? "amber" : "ink"}
              hint={`beyond ${limit}h/week`}
            />
          </div>

          <Card className="rise rise-2 mt-4" title="Weeks">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {summary.weeks.length === 0 && (
                <li className="text-sm text-ink-faint">No worked hours in range.</li>
              )}
              {summary.weeks.map((w) => {
                const ot = Math.max(0, w.hours - limit);
                return (
                  <li
                    key={w.weekKey}
                    className={`rounded-md border px-3 py-2 ${
                      ot > 0 ? "border-amber/40 bg-amber-soft" : "border-line-soft bg-paper"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase text-ink-faint">
                      {w.weekKey}
                      {lockedWeeks.has(w.weekKey) && <Stamp value="LOCKED" />}
                    </div>
                    <div className="tnum text-lg font-semibold">
                      {formatHours(w.hours)}
                      {ot > 0 && <span className="ml-2 text-sm text-amber">+{formatHours(ot)} OT</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="rise rise-3 mt-4" title="Daily ledger">
            {activeDays.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">Nothing recorded in this range.</p>
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
                        <td className="py-2">{d.onLeave && <Stamp value={d.onLeave} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal title={`Adjust ${worker?.name ?? "worker"}'s hours`} open={adjusting} onClose={() => setAdjusting(false)}>
        <form onSubmit={submitAdjustment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                required
                value={adj.date}
                onChange={(e) => setAdj((a) => ({ ...a, date: e.target.value }))}
              />
            </Field>
            <Field label="Hours (±)" hint="Quarter-hour steps, e.g. -1.25">
              <Input
                type="number"
                step={0.25}
                min={-24}
                max={24}
                required
                value={adj.deltaHours}
                onChange={(e) => setAdj((a) => ({ ...a, deltaHours: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Reason" hint="The worker sees this in their notification.">
            <TextArea
              rows={2}
              required
              value={adj.reason}
              onChange={(e) => setAdj((a) => ({ ...a, reason: e.target.value }))}
              placeholder="e.g. Left early — dentist appointment"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdjusting(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Apply adjustment"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
