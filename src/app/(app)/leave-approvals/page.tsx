"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/toast";
import { Button, EmptyState, Field, PageHeader, Spinner, Stamp, TextArea } from "../../../components/ui";

interface Leave {
  id: string;
  type: "PAID" | "UNPAID";
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  managerNote: string | null;
  createdAt: string;
  worker: { id: string; name: string; email: string };
}

export default function LeaveApprovalsPage() {
  const toast = useToast();
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [rejecting, setRejecting] = useState<Leave | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ leaves: Leave[] }>("/api/leave");
    setLeaves(data.leaves);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(leave: Leave, action: "APPROVE" | "REJECT", rejectNote?: string) {
    setBusy(leave.id);
    try {
      await api(`/api/leave/${leave.id}/decision`, {
        body: { action, ...(rejectNote ? { note: rejectNote } : {}) },
      });
      toast("success", `${leave.worker.name}'s leave ${action === "APPROVE" ? "approved" : "rejected"}`);
      setRejecting(null);
      setNote("");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  const pending = leaves?.filter((l) => l.status === "PENDING") ?? [];
  const decided = leaves?.filter((l) => l.status !== "PENDING").slice(0, 12) ?? [];

  return (
    <>
      <PageHeader
        title="Leave Approvals"
        sub="Approve or reject paid and unpaid leave. Approved paid leave draws down balances; unpaid leave is deducted at payroll."
      />

      {leaves === null ? (
        <Spinner />
      ) : pending.length === 0 ? (
        <EmptyState title="No pending requests" hint="Workers' leave requests appear here." />
      ) : (
        <ul className="space-y-3">
          {pending.map((l, i) => (
            <li
              key={l.id}
              className={`rise rise-${Math.min(i + 1, 5)} rounded-lg border border-line bg-card px-5 py-4`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-semibold">{l.worker.name}</span>
                <Stamp value={l.type} />
                <span className="text-sm text-ink-soft">
                  {formatDate(l.startDate)}
                  {l.endDate !== l.startDate && <> – {formatDate(l.endDate)}</>}
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy === l.id}
                    onClick={() => {
                      setRejecting(l);
                      setNote("");
                    }}
                  >
                    Reject
                  </Button>
                  <Button size="sm" disabled={busy === l.id} onClick={() => decide(l, "APPROVE")}>
                    {busy === l.id ? "…" : "Approve"}
                  </Button>
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">“{l.reason}”</p>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-semibold">History</h2>
          <ul className="space-y-2">
            {decided.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5 text-sm"
              >
                <Stamp value={l.status} />
                <Stamp value={l.type} />
                <span className="font-medium">{l.worker.name}</span>
                <span className="text-ink-soft">
                  {formatDate(l.startDate)}
                  {l.endDate !== l.startDate && <> – {formatDate(l.endDate)}</>}
                </span>
                {l.managerNote && <span className="text-xs text-ink-faint">“{l.managerNote}”</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        title={`Reject ${rejecting?.worker.name}'s leave`}
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
      >
        <div className="space-y-4">
          <Field label="Note to the worker">
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Release week — can we do the following week instead?"
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
              Reject leave
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
