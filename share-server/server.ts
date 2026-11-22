import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { mkdirSync, createWriteStream, readdirSync, statSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const STORE = "artifacts";
const PORT = 3000;
// ponytail: first real IPv4. Several NICs (or the wrong one) → set BASE_URL.
const lanIp = () => {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/^(lo|utun|awdl|llw|bridge|docker|veth|vmnet)/.test(name)) continue;
    const hit = addrs?.find((a) => a.family === "IPv4" && !a.internal);
    if (hit) return hit.address;
  }
  return "127.0.0.1";
};
const BASE = process.env.BASE_URL ?? `http://${lanIp()}:${PORT}`;
const TTL_MS = Number(process.env.TTL_HOURS ?? 24) * 3600_000;

mkdirSync(STORE, { recursive: true });
const app = new Hono();

app.post("/artifacts", async (c) => {
  const files = (await c.req.formData()).getAll("files") as File[];
  if (!files.length) return c.json({ error: "no files under field 'files'" }, 400);
  const id = randomUUID();
  mkdirSync(join(STORE, id), { recursive: true });
  const names = files.map((f) => basename(f.name));
  await Promise.all(
    files.map((f, i) =>
      pipeline(Readable.fromWeb(f.stream()), createWriteStream(join(STORE, id, names[i])))
    )
  );
  return c.json({ id, urls: names.map((n) => `${BASE}/artifacts/${id}/${n}`) });
});

app.get("/artifacts/:id", (c) => {
  const id = basename(c.req.param("id"));
  try {
    return c.json({ id, files: readdirSync(join(STORE, id)) });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

app.get("/artifacts/:id/:name", (c, next) =>
  serveStatic({
    path: `./${join(STORE, basename(c.req.param("id")), basename(c.req.param("name")))}`,
  })(c, next)
);

// ponytail: mtime sweep on an interval. Swap for a cron/object-store lifecycle rule if this outlives the hackathon.
const sweep = () => {
  for (const d of readdirSync(STORE)) {
    const p = join(STORE, d);
    if (Date.now() - statSync(p).mtimeMs > TTL_MS) rmSync(p, { recursive: true, force: true });
  }
};
sweep();
setInterval(sweep, 3600_000).unref();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: PORT }, () => console.log(BASE));
