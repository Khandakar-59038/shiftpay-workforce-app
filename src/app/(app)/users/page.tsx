"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/client";
import { formatCents } from "../../../lib/money";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/toast";
import { Button, Field, Input, PageHeader, Select, Spinner, Stamp } from "../../../components/ui";

interface User {
  id: string;
  name: string;
  email: string;
  role: "WORKER" | "MANAGER" | "ADMIN";
  hourlyRateCents: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "WORKER" as User["role"],
  hourlyRate: "20",
};

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ name: "", role: "WORKER" as User["role"], hourlyRate: "0", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersData, settingsData] = await Promise.all([
      api<{ users: User[] }>("/api/users"),
      api<{ settings: { currencyCode: string } }>("/api/settings"),
    ]);
    setUsers(usersData.users);
    setCurrency(settingsData.settings.currencyCode);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/users", {
        body: {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          hourlyRateCents: Math.round(Number(form.hourlyRate) * 100),
        },
      });
      toast("success", `${form.name} added`);
      setCreating(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: {
          name: editForm.name,
          role: editForm.role,
          hourlyRateCents: Math.round(Number(editForm.hourlyRate) * 100),
          ...(editForm.newPassword ? { newPassword: editForm.newPassword } : {}),
        },
      });
      toast("success", "User updated");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    if (
      user.isActive &&
      !window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)
    )
      return;
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        body: { isActive: !user.isActive },
      });
      toast("success", `${user.name} ${user.isActive ? "deactivated" : "reactivated"}`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        sub="Create accounts, assign roles and hourly rates, reset passwords."
        actions={<Button onClick={() => { setCreating(true); setError(null); }}>Add user</Button>}
      />

      {users === null ? (
        <Spinner />
      ) : (
        <div className="rise overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="rule text-left font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 text-right font-semibold">Hourly rate</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`rule last:border-b-0 ${u.isActive ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-ink-faint">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Stamp value={u.role} />
                  </td>
                  <td className="tnum px-4 py-3 text-right">
                    {u.role === "WORKER" ? `${formatCents(u.hourlyRateCents, currency)}/h` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${u.isActive ? "text-accent" : "text-red"}`}>
                      {u.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(u);
                          setError(null);
                          setEditForm({
                            name: u.name,
                            role: u.role,
                            hourlyRate: String(u.hourlyRateCents / 100),
                            newPassword: "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant={u.isActive ? "danger" : "outline"}
                        size="sm"
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="Add user" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Full name">
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
              >
                <option value="WORKER">Worker</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Field label={`Hourly rate (${currency})`}>
              <Input
                type="number"
                min={0}
                step={0.01}
                required
                value={form.hourlyRate}
                onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Password" hint="At least 8 characters.">
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </Field>
          {error && <p role="alert" className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title={`Edit ${editing?.name ?? ""}`} open={editing !== null} onClose={() => setEditing(null)}>
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="Full name">
            <Input required value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
              >
                <option value="WORKER">Worker</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Field label={`Hourly rate (${currency})`}>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={editForm.hourlyRate}
                onChange={(e) => setEditForm((f) => ({ ...f, hourlyRate: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Reset password" hint="Leave blank to keep the current password.">
            <Input
              type="password"
              minLength={8}
              value={editForm.newPassword}
              onChange={(e) => setEditForm((f) => ({ ...f, newPassword: e.target.value }))}
              placeholder="New password"
            />
          </Field>
          {error && <p role="alert" className="rounded-md border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
