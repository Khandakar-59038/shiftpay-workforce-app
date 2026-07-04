"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDate, todayStr } from "../lib/dates";
import { api } from "../lib/client";
import { useToast } from "./toast";

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: "OPEN" | "DONE";
}

export function QuickTasks() {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ tasks: Task[] }>("/api/tasks");
    setTasks(data.tasks.filter((t) => t.status === "OPEN"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(task: Task) {
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status: "DONE" } });
      toast("success", `“${task.title}” done`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  const today = todayStr();

  return (
    <section className="rounded-lg border border-line bg-card">
      <header className="rule flex items-center justify-between px-5 py-3">
        <h2 className="font-display text-base font-semibold">
          Quick tasks{tasks && tasks.length > 0 && <span className="ml-1.5 text-sm font-normal text-ink-soft">({tasks.length})</span>}
        </h2>
        <Link href="/tasks" className="text-xs font-medium text-accent hover:underline">
          All tasks →
        </Link>
      </header>
      <div className="px-5 py-3">
        {tasks === null ? (
          <p className="py-2 text-sm text-ink-faint">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="py-2 text-sm text-ink-faint">No open tasks. You&apos;re all caught up.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  onChange={() => complete(t)}
                  aria-label={`Mark “${t.title}” done`}
                  className="size-4 cursor-pointer accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.dueDate && (
                  <span
                    className={`shrink-0 font-mono text-[0.62rem] ${t.dueDate < today ? "text-red" : "text-ink-faint"}`}
                  >
                    {formatDate(t.dueDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
