"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/client";
import { useToast } from "../../../components/toast";
import { Button, Card, Field, Input, PageHeader, TextArea } from "../../../components/ui";

interface Settings {
  weeklyHourLimit: number;
  overtimeMultiplier: number;
  paidLeaveDaysPerYear: number;
  sickLeaveDaysPerYear: number;
  standardDayHours: number;
  payFrequencyDefault: string;
}

export default function SupportPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ subject: "", body: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ settings: Settings }>("/api/settings").then((d) => setSettings(d.settings));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/support", { body: form });
      toast("success", "Sent to the admin team — replies arrive in your Chat");
      setForm({ subject: "", body: "" });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  const faqs = settings
    ? [
        {
          q: "How is my pay calculated?",
          a: `Approved hours × your hourly rate. Hours beyond ${settings.weeklyHourLimit}h in a week are overtime, paid at ×${settings.overtimeMultiplier}. Approved time off and sick days are paid at ${settings.standardDayHours}h × your rate; unpaid leave is shown as a deduction. Every payslip shows the full math.`,
        },
        {
          q: "How do I clock in and out?",
          a: "From your Dashboard. If you have an approved shift today, use “Clock in — today's shift”. For other company work, use “Clock in — extra work” and say what you're doing. When you clock out, add a note — the shift goes to your manager and counts once approved.",
        },
        {
          q: "How much leave do I have?",
          a: `The company allowance is ${settings.paidLeaveDaysPerYear} time-off days and ${settings.sickLeaveDaysPerYear} sick days per year. Your live balances are on the Leave page. Unpaid leave has no limit but reduces pay.`,
        },
        {
          q: "What does “Lock week” mean?",
          a: "At the end of a week you can lock your hours on the Time & Overtime page. It tells your manager “these hours are correct and final from my side” before payroll runs.",
        },
        {
          q: "When do I get paid?",
          a: `Payroll runs ${settings.payFrequencyDefault.toLowerCase()} by default. You get a notification the moment a payment is disbursed, and every payslip lives on your Pay page.`,
        },
        {
          q: "My schedule was rejected — what now?",
          a: "Open My Schedule, read your manager's note on the rejected week, press “Edit & resubmit”, adjust the hours, and submit again.",
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Support Center"
        sub="Answers to the common questions — or write directly to the admin team."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rise lg:col-span-3">
          <h2 className="mb-3 font-display text-xl font-semibold">Frequently asked</h2>
          <div className="space-y-2">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-lg border border-line bg-card px-4 py-3 open:pb-4"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                  <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90">
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <Card className="rise rise-2 h-fit lg:col-span-2" title="Contact the admin team">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Subject">
              <Input
                required
                maxLength={150}
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Wrong hours on my payslip"
              />
            </Field>
            <Field label="Message" hint="Goes to every admin as a direct message — they reply in Chat.">
              <TextArea
                required
                rows={5}
                maxLength={2000}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Describe what you need help with…"
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send to support"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
