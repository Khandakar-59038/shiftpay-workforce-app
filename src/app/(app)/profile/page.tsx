"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/client";
import { Icon } from "../../../components/icons";
import { useToast } from "../../../components/toast";
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Stamp } from "../../../components/ui";

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  address: string | null;
  emergencyContact: string | null;
  createdAt: string;
}
interface Doc {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export default function ProfilePage() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [info, setInfo] = useState({ phone: "", address: "", emergencyContact: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [meData, docData] = await Promise.all([
      api<{ user: Me }>("/api/me"),
      api<{ documents: Doc[] }>("/api/documents"),
    ]);
    setMe(meData.user);
    setDocs(docData.documents);
    setInfo({
      phone: meData.user.phone ?? "",
      address: meData.user.address ?? "",
      emergencyContact: meData.user.emergencyContact ?? "",
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setBusy("info");
    try {
      await api("/api/me", { method: "PATCH", body: info });
      toast("success", "Personal information saved");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw");
    try {
      await api("/api/me/password", { body: pw });
      toast("success", "Password changed");
      setPw({ current: "", next: "" });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast("success", `${file.name} uploaded`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDoc(doc: Doc) {
    if (!window.confirm(`Delete “${doc.name}”? This cannot be undone.`)) return;
    try {
      await api(`/api/documents/${doc.id}`, { method: "DELETE" });
      toast("success", "Document deleted");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!me) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Profile"
        sub="Your personal information, documents, and account settings."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise" title="Personal information" actions={<Stamp value={me.role} />}>
          <form onSubmit={saveInfo} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" hint="Managed by your admin.">
                <Input value={me.name} disabled className="opacity-60" />
              </Field>
              <Field label="Email" hint="Managed by your admin.">
                <Input value={me.email} disabled className="opacity-60" />
              </Field>
            </div>
            <Field label="Phone">
              <Input
                value={info.phone}
                onChange={(e) => setInfo((i) => ({ ...i, phone: e.target.value }))}
                placeholder="+45 …"
              />
            </Field>
            <Field label="Address">
              <Input
                value={info.address}
                onChange={(e) => setInfo((i) => ({ ...i, address: e.target.value }))}
                placeholder="Street, city"
              />
            </Field>
            <Field label="Emergency contact" hint="Name and number, e.g. “Rina — +45 12 34 56 78”.">
              <Input
                value={info.emergencyContact}
                onChange={(e) => setInfo((i) => ({ ...i, emergencyContact: e.target.value }))}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === "info"}>
                {busy === "info" ? "Saving…" : "Save information"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card
            className="rise rise-1"
            title="Personal documents"
            actions={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                />
                <Button size="sm" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
                  {busy === "upload" ? "Uploading…" : "Upload"}
                </Button>
              </>
            }
          >
            {docs === null ? (
              <Spinner />
            ) : docs.length === 0 ? (
              <EmptyState
                title="No documents yet"
                hint="Contracts, certificates, IDs — private to you (admins can review)."
              />
            ) : (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-md border border-line-soft bg-paper px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="font-mono text-[0.62rem] text-ink-faint">
                        {fmtSize(d.size)} · {new Date(d.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <a
                      href={`/api/documents/${d.id}`}
                      className="rounded-md border border-line p-1.5 text-ink-soft hover:border-accent hover:text-accent"
                      title="Download"
                    >
                      <Icon name="download" className="size-3.5" />
                    </a>
                    <button
                      onClick={() => removeDoc(d)}
                      className="cursor-pointer rounded-md border border-line p-1.5 text-ink-soft hover:border-red hover:text-red"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="rise rise-2" title="Settings · password">
            <form onSubmit={changePassword} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current password">
                  <Input
                    type="password"
                    required
                    value={pw.current}
                    onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={pw.next}
                    onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={busy === "pw"}>
                  {busy === "pw" ? "Changing…" : "Change password"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
