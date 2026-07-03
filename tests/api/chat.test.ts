import { beforeEach, describe, expect, it } from "vitest";
import { GET as getMessages, POST as sendMessage } from "../../src/app/api/messages/route";
import { GET as getSummary } from "../../src/app/api/messages/summary/route";
import { authCookie, createUser, jsonRequest, resetDb } from "./helpers";

beforeEach(resetDb);

describe("company channel", () => {
  it("delivers messages to everyone with sender names", async () => {
    const worker = await createUser("WORKER", { name: "Alice Chen" });
    const manager = await createUser("MANAGER");

    const post = await sendMessage(
      jsonRequest("/api/messages", {
        cookie: await authCookie(worker),
        body: { body: "Fridge in the break room is fixed!" },
      }),
    );
    expect(post.status).toBe(201);

    const res = await getMessages(
      jsonRequest("/api/messages?with=company", {
        method: "GET",
        cookie: await authCookie(manager),
      }),
    );
    const { messages } = await res.json();
    expect(messages).toHaveLength(1);
    expect(messages[0].sender.name).toBe("Alice Chen");
    expect(messages[0].body).toMatch(/break room/);
  });

  it("rejects empty messages", async () => {
    const worker = await createUser("WORKER");
    const res = await sendMessage(
      jsonRequest("/api/messages", { cookie: await authCookie(worker), body: { body: "  " } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("direct messages", () => {
  it("tracks unread counts and marks read on fetch", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");

    await sendMessage(
      jsonRequest("/api/messages", {
        cookie: await authCookie(worker),
        body: { body: "Can I swap Friday?", recipientId: manager.id },
      }),
    );

    const managerCookie = await authCookie(manager);
    const before = await (
      await getSummary(jsonRequest("/api/messages/summary", { method: "GET", cookie: managerCookie }))
    ).json();
    expect(before.unread[worker.id]).toBe(1);
    expect(before.totalUnread).toBe(1);

    const thread = await (
      await getMessages(
        jsonRequest(`/api/messages?with=${worker.id}`, { method: "GET", cookie: managerCookie }),
      )
    ).json();
    expect(thread.messages).toHaveLength(1);

    const after = await (
      await getSummary(jsonRequest("/api/messages/summary", { method: "GET", cookie: managerCookie }))
    ).json();
    expect(after.totalUnread).toBe(0);
  });

  it("keeps DMs private to the two participants", async () => {
    const worker = await createUser("WORKER");
    const manager = await createUser("MANAGER");
    const bystander = await createUser("WORKER");

    await sendMessage(
      jsonRequest("/api/messages", {
        cookie: await authCookie(worker),
        body: { body: "private note", recipientId: manager.id },
      }),
    );

    const res = await getMessages(
      jsonRequest(`/api/messages?with=${worker.id}`, {
        method: "GET",
        cookie: await authCookie(bystander),
      }),
    );
    const { messages } = await res.json();
    expect(messages).toHaveLength(0); // bystander↔worker thread is empty
  });

  it("404s when messaging an unknown or inactive user", async () => {
    const worker = await createUser("WORKER");
    const inactive = await createUser("WORKER", { isActive: false });
    const cookie = await authCookie(worker);

    const unknown = await sendMessage(
      jsonRequest("/api/messages", { cookie, body: { body: "hi", recipientId: "nope" } }),
    );
    expect(unknown.status).toBe(404);

    const gone = await sendMessage(
      jsonRequest("/api/messages", { cookie, body: { body: "hi", recipientId: inactive.id } }),
    );
    expect(gone.status).toBe(404);
  });
});

describe("summary directory", () => {
  it("lists active colleagues with contact details, excluding self", async () => {
    const worker = await createUser("WORKER", { name: "Alice Chen" });
    await createUser("MANAGER", { name: "Maya Rahman" });
    await createUser("WORKER", { isActive: false });

    const res = await getSummary(
      jsonRequest("/api/messages/summary", { method: "GET", cookie: await authCookie(worker) }),
    );
    const { people } = await res.json();
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("Maya Rahman");
  });
});
