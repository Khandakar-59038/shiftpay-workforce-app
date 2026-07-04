import { beforeEach, describe, expect, it } from "vitest";
import { GET as listDocs, POST as upload } from "../../src/app/api/documents/route";
import { DELETE as removeDoc, GET as download } from "../../src/app/api/documents/[id]/route";
import { authCookie, createUser, resetDb } from "./helpers";

beforeEach(resetDb);

function uploadRequest(cookie: string, name = "contract.pdf", type = "application/pdf") {
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode("%PDF-1.4 demo")], name, { type }));
  return new Request("http://localhost/api/documents", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
}

describe("personal documents", () => {
  it("uploads, lists, downloads, and deletes an own document", async () => {
    const worker = await createUser("WORKER");
    const cookie = await authCookie(worker);

    const created = await upload(uploadRequest(cookie));
    expect(created.status).toBe(201);
    const { document } = await created.json();
    expect(document.name).toBe("contract.pdf");

    const list = await listDocs(
      new Request("http://localhost/api/documents", { headers: { cookie } }),
    );
    expect((await list.json()).documents).toHaveLength(1);

    const dl = await download(
      new Request(`http://localhost/api/documents/${document.id}`, { headers: { cookie } }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(dl.status).toBe(200);
    expect(await dl.text()).toContain("%PDF");

    const del = await removeDoc(
      new Request(`http://localhost/api/documents/${document.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(del.status).toBe(200);
  });

  it("keeps documents private from other users but visible to admins", async () => {
    const worker = await createUser("WORKER");
    const other = await createUser("WORKER");
    const admin = await createUser("ADMIN");
    const { document } = await (await upload(uploadRequest(await authCookie(worker)))).json();

    const stranger = await download(
      new Request(`http://localhost/api/documents/${document.id}`, {
        headers: { cookie: await authCookie(other) },
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(stranger.status).toBe(403);

    const adminView = await download(
      new Request(`http://localhost/api/documents/${document.id}`, {
        headers: { cookie: await authCookie(admin) },
      }),
      { params: Promise.resolve({ id: document.id }) },
    );
    expect(adminView.status).toBe(200);
  });

  it("rejects disallowed file types", async () => {
    const worker = await createUser("WORKER");
    const res = await upload(
      uploadRequest(await authCookie(worker), "script.sh", "application/x-sh"),
    );
    expect(res.status).toBe(400);
  });
});
