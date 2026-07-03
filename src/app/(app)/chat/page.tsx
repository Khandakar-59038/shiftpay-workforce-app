"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/client";
import { Icon } from "../../../components/icons";
import { useToast } from "../../../components/toast";
import { Button, PageHeader, Spinner, Stamp } from "../../../components/ui";

interface Person {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string | null;
}
interface Message {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; role: string };
}

export default function ChatPage() {
  const toast = useToast();
  const [me, setMe] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string>("company");
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const loadSummary = useCallback(async () => {
    const data = await api<{ people: Person[]; unread: Record<string, number> }>(
      "/api/messages/summary",
    );
    setPeople(data.people);
    setUnread(data.unread);
  }, []);

  const loadThread = useCallback(async () => {
    const data = await api<{ messages: Message[] }>(`/api/messages?with=${selected}`);
    setMessages(data.messages);
  }, [selected]);

  useEffect(() => {
    void api<{ user: { id: string } }>("/api/me").then((d) => setMe(d.user.id));
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setMessages(null);
    void loadThread();
    void loadSummary();
    const t = setInterval(() => {
      void loadThread();
      void loadSummary();
    }, 8000);
    return () => clearInterval(t);
  }, [loadThread, loadSummary]);

  useEffect(() => {
    if (messages && messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api("/api/messages", {
        body: { body: draft.trim(), ...(selected !== "company" ? { recipientId: selected } : {}) },
      });
      setDraft("");
      await loadThread();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Message failed");
    } finally {
      setSending(false);
    }
  }

  const current = people.find((p) => p.id === selected);
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <>
      <PageHeader
        title="Chat"
        sub="Message the whole company or anyone directly — call or email in one tap."
      />

      <div className="rise flex h-[calc(100vh-14rem)] min-h-[480px] overflow-hidden rounded-lg border border-line bg-card">
        {/* People */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-paper/60 sm:w-64">
          <button
            onClick={() => setSelected("company")}
            className={`rule flex items-center gap-2 px-4 py-3 text-left text-sm font-medium ${
              selected === "company" ? "bg-accent-soft text-accent-deep" : "hover:bg-line-soft"
            }`}
          >
            <Icon name="chat" className="size-4" />
            Company channel
          </button>
          <div className="px-4 pb-1 pt-3 font-mono text-[0.6rem] uppercase tracking-wider text-ink-faint">
            People
          </div>
          <ul className="flex-1 overflow-y-auto">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p.id)}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${
                    selected === p.id ? "bg-accent-soft text-accent-deep" : "hover:bg-line-soft"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <Stamp value={p.role} />
                  </span>
                  {unread[p.id] > 0 && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[0.6rem] font-semibold text-white">
                      {unread[p.id]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="rule flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {selected === "company" ? "Company channel" : current?.name}
              </div>
              <div className="text-xs text-ink-faint">
                {selected === "company" ? "Everyone at the company" : current?.email}
              </div>
            </div>
            {current && (
              <div className="flex items-center gap-1.5">
                {current.phone && (
                  <a
                    href={`tel:${current.phone}`}
                    title={`Call ${current.name} (${current.phone})`}
                    className="rounded-md border border-line p-2 text-ink-soft hover:border-accent hover:text-accent"
                  >
                    <Icon name="phone" className="size-4" />
                  </a>
                )}
                <a
                  href={`mailto:${current.email}`}
                  title={`Email ${current.name}`}
                  className="rounded-md border border-line p-2 text-ink-soft hover:border-accent hover:text-accent"
                >
                  <Icon name="mail" className="size-4" />
                </a>
              </div>
            )}
          </header>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {messages === null && <Spinner label="Opening thread…" />}
            {messages?.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-faint">
                {selected === "company"
                  ? "No messages yet — say hello to the whole team."
                  : "No messages yet — start the conversation."}
              </p>
            )}
            {messages?.map((m) => {
              const mine = m.sender.id === me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      mine
                        ? "bg-accent text-white"
                        : "border border-line-soft bg-paper text-ink"
                    }`}
                  >
                    {!mine && selected === "company" && (
                      <div className="mb-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wide opacity-70">
                        {m.sender.name}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div
                      className={`mt-1 text-right font-mono text-[0.58rem] ${mine ? "text-white/70" : "text-ink-faint"}`}
                    >
                      {fmt(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-line px-3 py-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                selected === "company" ? "Message everyone…" : `Message ${current?.name ?? ""}…`
              }
              maxLength={2000}
              className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint"
              aria-label="Message"
            />
            <Button type="submit" disabled={sending || !draft.trim()}>
              Send
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
