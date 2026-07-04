"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/client";
import { useToast } from "../../../components/toast";
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from "../../../components/ui";

interface Settings {
  weeklyHourLimit: number;
  overtimeMultiplier: number;
  overtimeAlertThreshold: number;
  paidLeaveDaysPerYear: number;
  sickLeaveDaysPerYear: number;
  standardDayHours: number;
  currencyCode: string;
  payFrequencyDefault: string;
}

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ settings: Settings }>("/api/settings").then((d) => setSettings(d.settings));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ settings: Settings }>("/api/settings", {
        method: "PATCH",
        body: settings,
      });
      setSettings(data.settings);
      toast("success", "Company settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function num(key: keyof Settings) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setSettings((s) => (s ? { ...s, [key]: Number(e.target.value) } : s));
  }

  return (
    <>
      <PageHeader
        title="Company Settings"
        sub="Working hours, overtime rules, leave policy, and payroll structure (SRS 2.3.2)."
      />

      {!settings ? (
        <Spinner />
      ) : (
        <form onSubmit={save} className="max-w-2xl space-y-4">
          <Card className="rise rise-1" title="Working hours & overtime">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Weekly hour limit" hint="Hours beyond this count as overtime.">
                <Input type="number" min={1} max={80} step={0.5} value={settings.weeklyHourLimit} onChange={num("weeklyHourLimit")} />
              </Field>
              <Field label="Overtime multiplier" hint="e.g. 1.5 = time-and-a-half.">
                <Input type="number" min={1} max={5} step={0.1} value={settings.overtimeMultiplier} onChange={num("overtimeMultiplier")} />
              </Field>
              <Field label="OT alert threshold" hint="Weekly OT hours that alert managers.">
                <Input type="number" min={0} max={80} step={0.5} value={settings.overtimeAlertThreshold} onChange={num("overtimeAlertThreshold")} />
              </Field>
            </div>
          </Card>

          <Card className="rise rise-2" title="Leave policy">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Time-off days / year">
                <Input type="number" min={0} max={365} value={settings.paidLeaveDaysPerYear} onChange={num("paidLeaveDaysPerYear")} />
              </Field>
              <Field label="Sick days / year">
                <Input type="number" min={0} max={365} value={settings.sickLeaveDaysPerYear} onChange={num("sickLeaveDaysPerYear")} />
              </Field>
              <Field label="Standard day hours" hint="Used to value a day of leave.">
                <Input type="number" min={1} max={24} step={0.5} value={settings.standardDayHours} onChange={num("standardDayHours")} />
              </Field>
            </div>
          </Card>

          <Card className="rise rise-3" title="Payroll structure">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select
                  value={settings.currencyCode}
                  onChange={(e) => setSettings((s) => (s ? { ...s, currencyCode: e.target.value } : s))}
                >
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="INR">INR — Indian Rupee (₹)</option>
                </Select>
              </Field>
              <Field label="Default pay frequency">
                <Select
                  value={settings.payFrequencyDefault}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, payFrequencyDefault: e.target.value } : s))
                  }
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </Field>
            </div>
          </Card>

          {error && (
            <p role="alert" className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">
              {error}
            </p>
          )}
          <div className="rise rise-4 flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
