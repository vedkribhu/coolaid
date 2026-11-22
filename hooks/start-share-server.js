#!/usr/bin/env node
// SessionStart hook: makes sure the file-share HTTP server (:3000) and its MCP
// endpoint (:4000) are running. Installs dependencies on first run. Returns
// immediately; the work happens in a detached child.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "share-server");
const data = process.env.CLAUDE_PLUGIN_DATA ?? join(homedir(), ".coolaid-share");
mkdirSync(data, { recursive: true });

const up = (port) =>
  new Promise((ok) => {
    const s = createConnection({ port, host: "127.0.0.1" }, () => (s.destroy(), ok(true)));
    s.on("error", () => ok(false));
  });

if (!(await up(3000)) || !(await up(4000))) {
  const log = openSync(join(data, "share-server.log"), "a");
  const tsx = join(dir, "node_modules", ".bin", "tsx");
  const script = [
    existsSync(tsx) ? "" : `(cd "${dir}" && npm install --no-audit --no-fund) || exit 1;`,
    `"${tsx}" "${dir}/server.ts" &`,
    `exec "${tsx}" "${dir}/mcp.ts"`,
  ].join(" ");
  // cwd = data dir so server.ts stores bundles in <data>/artifacts.
  spawn("sh", ["-c", script], { cwd: data, detached: true, stdio: ["ignore", log, log] }).unref();
}
process.stdout.write("{}");
