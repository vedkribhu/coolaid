// Local viewer. Serves the gallery at / and each artifact at /a/<id>[?v=n].
// Binds to 127.0.0.1 only.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";

export const PORT = Number(process.env.OPEN_ARTIFACTS_PORT || 4319);
export const HOST = "127.0.0.1";
export const origin = () => `http://${HOST}:${PORT}`;
export const urlFor = (id) => `${origin()}/a/${id}`;

// Same allowlist the page contract in skills/artifacts/SKILL.md promises.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Pages may be fragments; give them a document skeleton like hosted artifacts do.
export function wrap(html, title) {
  if (/^\s*<!doctype/i.test(html)) return html;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title></head>
<body>
${html}
</body></html>`;
}

function gallery(metas) {
  const rows = metas
    .map(
      (m) => `<li><a href="/a/${m.id}">${esc(m.title)}</a>
<span>${esc(m.description || "")}</span>
<time>v${m.versions.length} · ${esc(m.updatedAt.slice(0, 16).replace("T", " "))}</time></li>`
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Open Artifacts</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--link:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#44403c;--link:#93c5fd}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:720px;padding:32px 16px}
ul{list-style:none;padding:0}li{border-bottom:1px solid var(--line);padding:12px 0;display:grid;gap:2px}
a{color:var(--link);font-weight:600;text-decoration:none}span,time{color:var(--muted);font-size:14px}
</style></head><body><h1>Open Artifacts</h1>
${metas.length ? `<ul>${rows}</ul>` : "<p>No artifacts yet.</p>"}</body></html>`;
}

export function handler() {
  return async (req, res) => {
    const url = new URL(req.url, origin());
    const send = (status, body, type = "text/html; charset=utf-8") => {
      res.writeHead(status, { "content-type": type, "content-security-policy": CSP, "x-content-type-options": "nosniff" });
      res.end(body);
    };
    try {
      if (url.pathname === "/healthz") return send(200, "ok", "text/plain");
      if (url.pathname === "/") return send(200, gallery(await store.list()));
      const m = url.pathname.match(/^\/a\/([a-f0-9]{12})\/?$/);
      if (m) {
        const v = url.searchParams.get("v");
        const { meta, html } = await store.read(m[1], v ? Number(v) : undefined);
        return send(200, wrap(html, meta.title));
      }
      send(404, "not found", "text/plain");
    } catch (err) {
      send(/not found|no version|invalid/.test(err.message) ? 404 : 500, err.message, "text/plain");
    }
  };
}

export async function isUp() {
  try {
    return (await fetch(`${origin()}/healthz`, { signal: AbortSignal.timeout(500) })).ok;
  } catch {
    return false;
  }
}

// Start the viewer as a detached process so it outlives the MCP server / CLI call.
export async function ensureServer() {
  if (await isUp()) return;
  spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", env: process.env }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await isUp()) return;
  }
  throw new Error(`viewer did not start on ${origin()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(handler()).listen(PORT, HOST, () => {
    process.stderr.write(`open-artifacts viewer on ${origin()}\n`);
  });
}
