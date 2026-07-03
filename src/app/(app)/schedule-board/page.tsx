"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDays, formatDate, mondayOf, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatCents, formatHours } from "../../../lib/money";
import { useToast } from "../../../components/toast";
import { Button, PageHeader, Spinner, Stamp, StatCard } from "../../../components/ui";

interface Cell {
  approved: number;
  pending: number;
  onLeave: "PAID" | "UNPAID" | null;
}
interface Row {
  worker: { id: string; name: string; hourlyRateCents?: number };
  cells: Record<string, Cell>;
  approvedHours: number;
  pendingHours: number;
  totalHours: number;
  overtimeHours: number;
  cost?: { totalCents: number; overtimeCents: number };
}
interface Board {
  viewer: "MANAGER" | "WORKER";
  weekStart: string;
  weekEnd: string;
  dates: string[];
  workers: Row[];
  pendingSchedules: { id: string; workerId: string; workerName: string; totalHours: number }[];
  totals: {
    byDate: Record<string, { hours: number; costCents?: number }>;
    weekHours: number;
    weekCostCents?: number;
  };
  settings: { weeklyHourLimit: number; overtimeMultiplier: number; currencyCode: string };
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ScheduleBoardPage() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayStr()));
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayStr();

  const load = useCallback(async () => {
    setBoard(null);
    setBoard(await api<Board>(`/api/schedule-board?weekStart=${weekStart}`));
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, workerName: string, action: "APPROVE" | "REJECT") {
    setBusy(id);
    try {
      await api(`/api/schedules/${id}/decision`, { body: { action } });
      toast("success", `${workerName}'s schedule ${action.toLowerCase()}d`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  const currency = board?.settings.currencyCode ?? "USD";

  return (
    <>
      <PageHeader
        title={board?.viewer === "WORKER" ? "Team Schedule" : "Schedule Board"}
        sub={
          board?.viewer === "WORKER"
            ? "See when everyone on the team is working this week."
            : "The week at a glance — everyone's hours, status, and projected labor cost."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ‹
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(todayStr()))}>
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              ›
            </Button>
          </div>
        }
      />

      {!board ? (
        <Spinner label="Building the board…" />
      ) : (
        <>
          <div
            className={`rise grid grid-cols-2 gap-3 ${board.viewer === "MANAGER" ? "lg:grid-cols-4" : ""}`}
          >
            <StatCard
              label="Scheduled hours"
              value={formatHours(board.totals.weekHours)}
              hint={`${formatDate(board.weekStart)} – ${formatDate(board.weekEnd)}`}
            />
            {board.totals.weekCostCents !== undefined && (
              <StatCard
                label="Projected labor cost"
                value={formatCents(board.totals.weekCostCents, currency)}
                hint="overtime-aware"
                tone="accent"
              />
            )}
            <StatCard
              label="Overtime scheduled"
              value={formatHours(board.workers.reduce((s, w) => s + w.overtimeHours, 0))}
              tone={board.workers.some((w) => w.overtimeHours > 0) ? "amber" : "ink"}
              hint={`beyond ${board.settings.weeklyHourLimit}h/week`}
            />
            {board.viewer === "MANAGER" && (
              <StatCard
                label="Awaiting approval"
                value={board.pendingSchedules.length}
                tone={board.pendingSchedules.length > 0 ? "amber" : "ink"}
                hint="pending schedules"
              />
            )}
          </div>

          <div className="rise rise-2 mt-5 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="rule font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 text-left font-semibold">Worker</th>
                  {board.dates.map((d, i) => (
                    <th
                      key={d}
                      className={`px-2 py-3 text-center font-semibold ${d === today ? "text-accent" : ""}`}
                    >
                      {DAY_LABELS[i]}
                      <span className="block font-normal">{d.slice(8)}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold">Week</th>
                </tr>
              </thead>
              <tbody>
                {board.workers.map((row) => (
                  <tr key={row.worker.id} className="rule last:border-b-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{row.worker.name}</div>
                      {row.worker.hourlyRateCents !== undefined && (
                        <div className="font-mono text-[0.62rem] text-ink-faint">
                          {formatCents(row.worker.hourlyRateCents, currency)}/h
                        </div>
                      )}
                    </td>
                    {board.dates.map((d) => {
                      const cell = row.cells[d];
                      const hours = cell.approved + cell.pending;
                      return (
                        <td key={d} className={`px-1 py-2.5 text-center ${d === today ? "bg-accent-soft/40" : ""}`}>
                          {cell.onLeave ? (
                            <span
                              className={`stamp ${cell.onLeave === "PAID" ? "text-accent bg-accent-soft" : "text-ink-faint bg-line-soft"}`}
                            >
                              leave
                            </span>
                          ) : hours === 0 ? (
                            <span className="text-ink-faint/50">—</span>
                          ) : (
                            <span
                              className={`tnum inline-block min-w-9 rounded-md px-1.5 py-1 font-semibold ${
                                cell.pending > 0
                                  ? "border border-dashed border-amber/50 bg-amber-soft text-amber"
                                  : "bg-line-soft text-ink"
                              }`}
                              title={cell.pending > 0 ? "Pending approval" : "Approved"}
                            >
                              {hours}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right">
                      <div className="tnum font-semibold">
                        {formatHours(row.totalHours)}
                        {row.overtimeHours > 0 && (
                          <span className="ml-1.5 text-xs text-amber">+{formatHours(row.overtimeHours)} OT</span>
                        )}
                      </div>
                      {row.cost && (
                        <div className="tnum text-xs text-ink-soft">
                          {formatCents(row.cost.totalCents, currency)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-paper font-medium">
                  <td className="px-4 py-2.5 font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
                    Day totals
                  </td>
                  {board.dates.map((d) => (
                    <td key={d} className="tnum px-1 py-2.5 text-center">
                      <div>{board.totals.byDate[d].hours || "—"}</div>
                      {(board.totals.byDate[d].costCents ?? 0) > 0 && (
                        <div className="text-[0.65rem] text-ink-faint">
                          {formatCents(board.totals.byDate[d].costCents!, currency)}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="tnum px-4 py-2.5 text-right">
                    <div>{formatHours(board.totals.weekHours)}</div>
                    {board.totals.weekCostCents !== undefined && (
                      <div className="text-[0.65rem] text-accent">
                        {formatCents(board.totals.weekCostCents, currency)}
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {board.viewer === "MANAGER" ? (
              <>
                Solid cells are approved; dashed amber cells await approval. Week cost pays hours beyond{" "}
                {board.settings.weeklyHourLimit}h at ×{board.settings.overtimeMultiplier}. Day-column
                costs are at base rate.
              </>
            ) : (
              <>Approved shifts and leave for the whole team, one week at a time.</>
            )}
          </p>

          {board.pendingSchedules.length > 0 && (
            <div className="rise rise-3 mt-6">
              <h2 className="mb-3 font-display text-xl font-semibold">Quick approvals</h2>
              <ul className="space-y-2">
                {board.pendingSchedules.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5"
                  >
                    <Stamp value="PENDING" />
                    <span className="text-sm font-medium">{p.workerName}</span>
                    <span className="tnum text-sm text-ink-soft">{formatHours(p.totalHours)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Link href="/approvals" className="text-xs text-accent hover:underline">
                        details →
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy === p.id}
                        onClick={() => decide(p.id, p.workerName, "REJECT")}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === p.id}
                        onClick={() => decide(p.id, p.workerName, "APPROVE")}
                      >
                        {busy === p.id ? "…" : "Approve"}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
