"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { formatCents } from "../../../lib/money";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/toast";
import { Button, Card, EmptyState, Field, PageHeader, Spinner, Stamp, TextArea } from "../../../components/ui";

interface Schedule {
  id: string;
  periodType: string;
  periodStart: string;
  status: string;
  submittedAt: string;
  managerNote: string | null;
  worker: { id: string; name: string; email: string };
  days: { id: string; date: string; hours: number }[];
}

interface TimeEntry {
  id: string;
  date: string;
  kind: "SCHEDULED" | "EXTRA";
  clockIn: string;
  clockOut: string | null;
  hours: number;
  note: string | null;
  status: string;
  worker: { id: string; name: string };
}

interface Impact {
  impacts: {
    weekKey: string;
    totalHours: number;
    addedOvertime: number;
    addedOvertimeCostCents: number;
  }[];
  totalAddedOvertime: number;
  totalAddedOvertimeCostCents: number;
  settings: { weeklyHourLimit: number; overtimeMultiplier: number; currencyCode: string };
}

export default function ApprovalsPage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [impacts, setImpacts] = useState<Record<string, Impact>>({});
  const [rejecting, setRejecting] = useState<Schedule | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [entries, setEntries] = useState<TimeEntry[] | null>(null);

  const load = useCallback(async () => {
    const [data, entryData] = await Promise.all([
      api<{ schedules: Schedule[] }>("/api/schedules"),
      api<{ entries: TimeEntry[] }>("/api/time-entries?status=PENDING"),
    ]);
    setSchedules(data.schedules);
    setEntries(entryData.entries);
    // Surface overtime consequences before the manager decides.
    const pending = data.schedules.filter((s) => s.status === "PENDING");
    const results = await Promise.all(
      pending.map(async (s) => [s.id, await api<Impact>(`/api/schedules/${s.id}/impact`)] as const),
    );
    setImpacts(Object.fromEntries(results));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(schedule: Schedule, action: "APPROVE" | "REJECT", rejectNote?: string) {
    setBusy(schedule.id);
    try {
      await api(`/api/schedules/${schedule.id}/decision`, {
        body: { action, ...(rejectNote ? { note: rejectNote } : {}) },
      });
      toast(
        "success",
        `${schedule.worker.name}'s schedule ${action === "APPROVE" ? "approved" : "rejected"}`,
      );
      setRejecting(null);
      setNote("");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  async function decideEntry(entry: TimeEntry, action: "APPROVE" | "REJECT") {
    const rejectNote =
      action === "REJECT"
        ? (window.prompt(`Note to ${entry.worker.name} (optional):`) ?? undefined)
        : undefined;
    setBusy(entry.id);
    try {
      await api(`/api/time-entries/${entry.id}/decision`, {
        body: { action, ...(rejectNote ? { note: rejectNote } : {}) },
      });
      toast(
        "success",
        `${entry.worker.name}'s ${entry.hours}h shift ${action === "APPROVE" ? "approved — hours counted" : "rejected"}`,
      );
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  const pending = schedules?.filter((s) => s.status === "PENDING") ?? [];
  const decided = schedules?.filter((s) => s.status !== "PENDING").slice(0, 10) ?? [];

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHeader
        title="Approvals"
        sub="Clocked shifts and submitted schedules — review, then approve or send back."
      />

      {entries && entries.length > 0 && (
        <div className="rise mb-7">
          <h2 className="mb-3 font-display text-xl font-semibold">
            Clocked shifts <span className="text-sm font-normal text-ink-soft">({entries.length})</span>
          </h2>
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3"
              >
                <Stamp value="PENDING" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {e.worker.name}
                    <span className="tnum ml-2 font-semibold">{e.hours}h</span>
                    <span className="tnum ml-2 text-ink-soft">
                      {formatDate(e.date)} · {fmtTime(e.clockIn)}–{e.clockOut ? fmtTime(e.clockOut) : "…"}
                    </span>
                    <span className="ml-2 font-mono text-[0.6rem] uppercase text-ink-faint">
                      {e.kind === "SCHEDULED" ? "assigned shift" : "extra work"}
                    </span>
                  </div>
                  {e.note && <div className="text-xs text-ink-soft">“{e.note}”</div>}
                </div>
                <span className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy === e.id}
                    onClick={() => decideEntry(e, "REJECT")}
                  >
                    Reject
                  </Button>
                  <Button size="sm" disabled={busy === e.id} onClick={() => decideEntry(e, "APPROVE")}>
                    {busy === e.id ? "…" : "Approve"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold">Schedules</h2>

      {schedules === null ? (
        <Spinner />
      ) : pending.length === 0 ? (
        <EmptyState title="Queue is clear" hint="New submissions land here for review." />
      ) : (
        <div className="space-y-4">
          {pending.map((s, i) => {
            const total = s.days.reduce((t, d) => t + d.hours, 0);
            return (
              <Card
                key={s.id}
                className={`rise rise-${Math.min(i + 1, 5)}`}
                title={
                  <span>
                    {s.worker.name}
                    <span className="ml-2 text-sm font-normal text-ink-soft">
                      {s.periodType === "WEEKLY" ? "week of" : "month of"} {formatDate(s.periodStart)}
                    </span>
                  </span>
                }
                actions={<Stamp value={s.status} />}
              >
                <div className="flex flex-wrap gap-1.5">
                  {s.days.map((d) => (
                    <span
                      key={d.id}
                      className="rounded-md border border-line-soft bg-paper px-2 py-1 text-center"
                    >
                      <span className="block font-mono text-[0.6rem] uppercase text-ink-faint">
                        {formatDate(d.date)}
                      </span>
                      <span className="tnum text-sm font-semibold">{d.hours}h</span>
                    </span>
                  ))}
                </div>
                {impacts[s.id] && impacts[s.id].totalAddedOvertime > 0 && (
                  <div className="mt-3 rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-amber">
                    Approving adds{" "}
                    <strong className="tnum">{impacts[s.id].totalAddedOvertime}h of overtime</strong>{" "}
                    (≈{" "}
                    <span className="tnum">
                      {formatCents(
                        impacts[s.id].totalAddedOvertimeCostCents,
                        impacts[s.id].settings.currencyCode,
                      )}
                    </span>{" "}
                    at ×{impacts[s.id].settings.overtimeMultiplier}) —{" "}
                    {impacts[s.id]
                      .impacts.filter((w) => w.addedOvertime > 0)
                      .map(
                        (w) =>
                          `${s.worker.name.split(" ")[0]} would be at ${w.totalHours}h in ${w.weekKey}`,
                      )
                      .join("; ")}
                    .
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-sm text-ink-soft">
                    Total <span className="tnum font-semibold text-ink">{total}h</span> · submitted{" "}
                    {new Date(s.submittedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy === s.id}
                      onClick={() => {
                        setRejecting(s);
                        setNote("");
                      }}
                    >
                      Reject
                    </Button>
                    <Button size="sm" disabled={busy === s.id} onClick={() => decide(s, "APPROVE")}>
                      {busy === s.id ? "…" : "Approve"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-semibold">Recently decided</h2>
          <ul className="space-y-2">
            {decided.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5 text-sm"
              >
                <Stamp value={s.status} />
                <span className="font-medium">{s.worker.name}</span>
                <span className="text-ink-soft">
                  {s.periodType === "WEEKLY" ? "week of" : "month of"} {formatDate(s.periodStart)}
                </span>
                {s.managerNote && <span className="text-xs text-ink-faint">“{s.managerNote}”</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        title={`Reject ${rejecting?.worker.name}'s schedule`}
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
      >
        <div className="space-y-4">
          <Field label="Note to the worker" hint="They'll see this and can resubmit.">
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Too many hours on Friday — rebalance earlier in the week."
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => rejecting && decide(rejecting, "REJECT", note || undefined)}
            >
              Reject schedule
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
