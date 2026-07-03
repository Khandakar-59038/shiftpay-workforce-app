"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client";
import { formatHours } from "../lib/money";
import { useToast } from "./toast";
import { Button, Stamp } from "./ui";

interface Entry {
  id: string;
  kind: "SCHEDULED" | "EXTRA";
  clockIn: string;
  clockOut: string | null;
  hours: number;
  note: string | null;
  status: string;
}
interface ClockState {
  active: Entry | null;
  today: Entry[];
  todayShift: { id: string; hours: number } | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <span className="tnum font-display text-4xl font-bold">
      {h}:{String(m).padStart(2, "0")}
      <span className="text-2xl text-ink-soft">:{String(s).padStart(2, "0")}</span>
    </span>
  );
}

export function TimeClock() {
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<ClockState | null>(null);
  const [note, setNote] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState(await api<ClockState>("/api/clock"));
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function clockIn(kind: "SCHEDULED" | "EXTRA") {
    setBusy(true);
    try {
      await api("/api/clock/in", {
        body: { kind, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast("success", kind === "SCHEDULED" ? "Clocked in — have a good shift" : "Clocked in for extra work");
      setNote("");
      setExtraOpen(false);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Clock-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    setBusy(true);
    try {
      const { entry } = await api<{ entry: Entry }>("/api/clock/out", {
        body: note.trim() ? { note: note.trim() } : {},
      });
      // The instant shift summary the moment a shift ends.
      toast(
        "success",
        `Shift recorded: ${formatHours(entry.hours)} (${fmtTime(entry.clockIn)}–${fmtTime(entry.clockOut!)}) — sent to your manager for approval`,
      );
      setNote("");
      await load();
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Clock-out failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <section className="rounded-lg border border-line bg-card px-5 py-6 text-sm text-ink-faint">
        Loading time clock…
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-card">
      <header className="rule flex items-center justify-between px-5 py-3">
        <h2 className="font-display text-base font-semibold">Time clock</h2>
        {state.todayShift ? (
          <span className="text-xs text-ink-soft">
            Today&apos;s shift: <strong className="tnum">{formatHours(state.todayShift.hours)}</strong>
          </span>
        ) : (
          <span className="text-xs text-ink-faint">No shift assigned today</span>
        )}
      </header>

      <div className="px-5 py-4">
        {state.active ? (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <Elapsed since={state.active.clockIn} />
              <div className="mt-0.5 text-xs text-ink-soft">
                {state.active.kind === "SCHEDULED" ? "On your assigned shift" : "Extra work"} · since{" "}
                {fmtTime(state.active.clockIn)}
              </div>
            </div>
            <div className="ml-auto flex w-full max-w-sm flex-col gap-2 sm:w-auto">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shift note (what happened, handover…)"
                className="rounded-md border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint"
                aria-label="Shift note"
              />
              <Button variant="danger" disabled={busy} onClick={clockOut}>
                {busy ? "Clocking out…" : "Clock out & submit"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {state.todayShift && (
              <Button disabled={busy} onClick={() => clockIn("SCHEDULED")}>
                Clock in — today&apos;s shift
              </Button>
            )}
            {!extraOpen ? (
              <Button variant="outline" disabled={busy} onClick={() => setExtraOpen(true)}>
                Clock in — extra work
              </Button>
            ) : (
              <span className="flex w-full max-w-md items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What are you working on?"
                  autoFocus
                  className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint"
                  aria-label="Extra work note"
                />
                <Button disabled={busy || !note.trim()} onClick={() => clockIn("EXTRA")}>
                  Start
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExtraOpen(false)}>
                  ✕
                </Button>
              </span>
            )}
          </div>
        )}

        {state.today.filter((e) => e.status !== "ACTIVE").length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
            {state.today
              .filter((e) => e.status !== "ACTIVE")
              .map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-paper px-3 py-2 text-sm"
                >
                  <Stamp value={e.status} />
                  <span className="tnum font-semibold">{formatHours(e.hours)}</span>
                  <span className="tnum text-ink-soft">
                    {fmtTime(e.clockIn)}–{e.clockOut ? fmtTime(e.clockOut) : "…"}
                  </span>
                  <span className="font-mono text-[0.6rem] uppercase text-ink-faint">
                    {e.kind === "SCHEDULED" ? "shift" : "extra"}
                  </span>
                  {e.note && <span className="text-xs text-ink-soft">“{e.note}”</span>}
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
