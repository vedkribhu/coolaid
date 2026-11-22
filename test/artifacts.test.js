import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

let tmp, page;
before(async () => {
  tmp = await mkdtemp(join(tmpdir(), "oa-"));
  process.env.OPEN_ARTIFACTS_HOME = tmp;
  process.env.OPEN_ARTIFACTS_PORT = String(40000 + Math.floor(Math.random() * 20000));
  page = join(tmp, "page.html");
});
after(() => rm(tmp, { recursive: true, force: true }));

test("publish, update in place, read versions, list, delete", async () => {
  const store = await import("../src/store.js");
  await writeFile(page, "<!doctype html><title>First Page</title><p>one</p>");
  const a = await store.publish({ filePath: page, description: "d", icon: "chart" });
  assert.equal(a.title, "First Page");
  assert.equal(a.versions.length, 1);

  await writeFile(page, "<p>two</p>");
  const b = await store.publish({ filePath: page, id: a.id });
  assert.equal(b.id, a.id);
  assert.equal(b.versions.length, 2);
  assert.equal(b.title, "First Page", "keeps title when new version has none");

  assert.match((await store.read(a.id)).html, /two/);
  assert.match((await store.read(a.id, 1)).html, /one/);
  assert.equal((await store.list()).length, 1);

  await store.remove(a.id);
  await assert.rejects(store.read(a.id), /not found/);
});

test("viewer serves pages with CSP and wraps fragments", async () => {
  const store = await import("../src/store.js");
  const { handler } = await import("../src/http.js");
  await writeFile(page, "<p>fragment</p>");
  const a = await store.publish({ filePath: page, title: "Frag" });

  const server = createServer(handler()).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/a/${a.id}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-security-policy"), /cdnjs\.cloudflare\.com/);
    const body = await res.text();
    assert.match(body, /^<!doctype html>/);
    assert.match(body, /<title>Frag<\/title>/);
    assert.equal((await fetch(`${base}/a/000000000000`)).status, 404);
    assert.match(await (await fetch(`${base}/`)).text(), /Frag/);
  } finally {
    server.close();
  }
});

test("MCP server lists and calls the artifact tool over stdio", async () => {
  const child = spawn(process.execPath, ["src/mcp.js"], { env: process.env });
  const lines = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      lines.push(JSON.parse(buf.slice(0, i)));
      buf = buf.slice(i + 1);
    }
  });
  const call = async (id, method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    while (!lines.some((l) => l.id === id)) await new Promise((r) => setTimeout(r, 10));
    return lines.find((l) => l.id === id);
  };
  try {
    const init = await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    assert.equal(init.result.serverInfo.name, "open-artifacts");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const tools = await call(2, "tools/list", {});
    assert.deepEqual(tools.result.tools.map((t) => t.name), ["artifact"]);

    const listed = await call(3, "tools/call", { name: "artifact", arguments: { action: "list" } });
    assert.ok(!listed.result.isError);
    assert.ok(Array.isArray(JSON.parse(listed.result.content[0].text).artifacts));

    const bad = await call(4, "tools/call", { name: "artifact", arguments: { action: "read", url: "nope" } });
    assert.equal(bad.result.isError, true);
  } finally {
    child.kill();
  }
});

test("SessionStart hook injects coolaid artifact context", async () => {
  const child = spawn(process.execPath, ["hooks/session-start.js"]);
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stdin.end(JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }));
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  const { hookSpecificOutput } = JSON.parse(out);
  assert.equal(hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(hookSpecificOutput.additionalContext, /coolaid/);
  assert.match(hookSpecificOutput.additionalContext, /mcp__plugin_open-artifacts_open-artifacts__artifact/);
});
