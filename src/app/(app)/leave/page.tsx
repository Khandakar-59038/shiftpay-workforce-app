"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, formatDate, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { useToast } from "../../../components/toast";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Stamp,
  StatCard,
  TextArea,
} from "../../../components/ui";

interface Leave {
  id: string;
  type: "PAID" | "UNPAID";
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  managerNote: string | null;
  createdAt: string;
}
interface Balance {
  allowance: number;
  used: number;
  remaining: number;
}

export default function LeavePage() {
  const toast = useToast();
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [form, setForm] = useState({
    type: "PAID" as "PAID" | "UNPAID",
    startDate: addDays(todayStr(), 7),
    endDate: addDays(todayStr(), 7),
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ leaves: Leave[]; balance: Balance }>("/api/leave");
    setLeaves(data.leaves);
    setBalance(data.balance);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/leave", { body: form });
      toast("success", "Leave request submitted");
      setForm((f) => ({ ...f, reason: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Leave" sub="Request paid or unpaid leave and track your balance." />

      {balance && (
        <div className="rise rise-1 grid grid-cols-3 gap-3">
          <StatCard label="Annual allowance" value={`${balance.allowance}d`} hint="paid leave" />
          <StatCard label="Used this year" value={`${balance.used}d`} />
          <StatCard label="Remaining" value={`${balance.remaining}d`} tone="accent" />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="rise rise-2 lg:col-span-2" title="New request">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Type" hint={form.type === "UNPAID" ? "Unpaid leave is deducted from payroll." : undefined}>
              <Select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "PAID" | "UNPAID" }))}
              >
                <option value="PAID">Paid leave</option>
                <option value="UNPAID">Unpaid leave</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First day">
                <Input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </Field>
              <Field label="Last day">
                <Input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Reason">
              <TextArea
                required
                rows={3}
                maxLength={500}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="A sentence for your manager…"
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </Card>

        <div className="rise rise-3 lg:col-span-3">
          <h2 className="mb-3 font-display text-xl font-semibold">History</h2>
          {leaves === null ? (
            <Spinner />
          ) : leaves.length === 0 ? (
            <EmptyState title="No leave requests yet" />
          ) : (
            <ul className="space-y-2">
              {leaves.map((l) => (
                <li key={l.id} className="rounded-lg border border-line bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stamp value={l.status} />
                    <Stamp value={l.type} />
                    <span className="text-sm font-medium">
                      {formatDate(l.startDate)}
                      {l.endDate !== l.startDate && <> – {formatDate(l.endDate)}</>}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{l.reason}</p>
                  {l.managerNote && (
                    <p className="mt-1 text-xs text-ink-faint">Manager: “{l.managerNote}”</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
