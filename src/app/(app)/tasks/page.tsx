"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate, todayStr } from "../../../lib/dates";
import { api } from "../../../lib/client";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/toast";
import { Button, EmptyState, Field, Input, PageHeader, Select, Spinner, TextArea } from "../../../components/ui";

interface Task {
  id: string;
  title: string;
  details: string | null;
  dueDate: string | null;
  status: "OPEN" | "DONE";
  createdAt: string;
  assignee: { id: string; name: string };
}
interface Person {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

export default function TasksPage() {
  const toast = useToast();
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", details: "", assigneeId: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ tasks: Task[] }>("/api/tasks");
    setTasks(data.tasks);
  }, []);

  useEffect(() => {
    void (async () => {
      const meData = await api<{ user: { id: string; role: string } }>("/api/me");
      setMe(meData.user);
      setForm((f) => ({ ...f, assigneeId: meData.user.id }));
      if (meData.user.role !== "WORKER") {
        const users = await api<{ users: Person[] }>("/api/users");
        setPeople(users.users.filter((u) => u.isActive));
      }
      await load();
    })();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/tasks", {
        body: {
          title: form.title,
          ...(form.details.trim() ? { details: form.details } : {}),
          assigneeId: form.assigneeId,
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        },
      });
      toast("success", "Task added");
      setCreating(false);
      setForm((f) => ({ ...f, title: "", details: "", dueDate: "" }));
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not add task");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: Task) {
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { status: task.status === "OPEN" ? "DONE" : "OPEN" },
      });
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  const open = tasks?.filter((t) => t.status === "OPEN") ?? [];
  const done = tasks?.filter((t) => t.status === "DONE").slice(0, 15) ?? [];
  const today = todayStr();
  const isManager = me?.role !== "WORKER";

  const row = (t: Task) => (
    <li
      key={t.id}
      className={`flex items-start gap-3 rounded-lg border border-line bg-card px-4 py-3 ${t.status === "DONE" ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={t.status === "DONE"}
        onChange={() => toggle(t)}
        aria-label={`Mark “${t.title}” ${t.status === "OPEN" ? "done" : "open"}`}
        className="mt-0.5 size-4 cursor-pointer accent-[var(--color-accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${t.status === "DONE" ? "line-through" : ""}`}>
          {t.title}
        </span>
        {t.details && <span className="block text-xs text-ink-soft">{t.details}</span>}
        <span className="mt-0.5 block font-mono text-[0.62rem] text-ink-faint">
          {isManager && <>{t.assignee.name} · </>}
          {t.dueDate && (
            <span className={t.status === "OPEN" && t.dueDate < today ? "text-red" : ""}>
              due {formatDate(t.dueDate)}
            </span>
          )}
        </span>
      </span>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Quick Tasks"
        sub={
          isManager
            ? "Small assignments for the team — they check them off, you see it instantly."
            : "Small jobs assigned to you, plus your own to-dos."
        }
        actions={<Button onClick={() => setCreating(true)}>Add task</Button>}
      />

      {tasks === null ? (
        <Spinner />
      ) : (
        <>
          {open.length === 0 ? (
            <EmptyState title="No open tasks" hint="You're all caught up." />
          ) : (
            <ul className="rise space-y-2">{open.map(row)}</ul>
          )}
          {done.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 font-display text-xl font-semibold">Done</h2>
              <ul className="space-y-2">{done.map(row)}</ul>
            </>
          )}
        </>
      )}

      <Modal title="Add quick task" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Task">
            <Input
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Restock shelf 4 before opening"
              autoFocus
            />
          </Field>
          <Field label="Details (optional)">
            <TextArea
              rows={2}
              maxLength={1000}
              value={form.details}
              onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {isManager && (
              <Field label="Assign to">
                <Select
                  value={form.assigneeId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Due date (optional)">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add task"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
