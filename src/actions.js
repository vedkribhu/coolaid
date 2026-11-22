// The one `artifact` tool, shared by the MCP server and the CLI.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import * as store from "./store.js";
import { ensureServer, urlFor } from "./http.js";

// Accept a bare id or any viewer URL (http://127.0.0.1:4319/a/<id>).
export function idFrom(ref) {
  if (!ref) return undefined;
  const m = String(ref).match(/([a-f0-9]{12})(?:\/?(?:\?.*)?)$/);
  if (!m) throw new Error(`not an artifact id or url: ${ref}`);
  return m[1];
}

function openInBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

const summary = (m) => ({
  id: m.id,
  url: urlFor(m.id),
  title: m.title,
  description: m.description,
  icon: m.icon,
  version: m.versions.length,
  updatedAt: m.updatedAt,
});

export async function run(input) {
  const { action = "publish" } = input;
  switch (action) {
    case "publish": {
      if (!input.file_path) throw new Error("publish needs file_path");
      const meta = await store.publish({
        filePath: resolve(input.file_path),
        id: idFrom(input.url),
        title: input.title,
        description: input.description,
        icon: input.icon,
        label: input.label,
      });
      await ensureServer();
      return { ...summary(meta), updated: meta.versions.length > 1 };
    }
    case "read": {
      const { meta, version, html } = await store.read(idFrom(input.url), input.version);
      return { ...summary(meta), version, html };
    }
    case "list": {
      const all = await store.list();
      return { artifacts: all.slice(0, input.limit ?? 25).map(summary), total: all.length };
    }
    case "delete": {
      const id = idFrom(input.url);
      await store.remove(id);
      return { deleted: id };
    }
    case "open": {
      const id = idFrom(input.url);
      await store.read(id);
      await ensureServer();
      openInBrowser(urlFor(id));
      return { opened: urlFor(id) };
    }
    default:
      throw new Error(`unknown action: ${action}`);
  }
}

export const TOOL = {
  name: "artifact",
  description:
    "Publish an HTML file as a viewable artifact page, or manage existing ones. " +
    "publish (default): file_path, optional title/description/icon; pass url to update that artifact in place as a new version. " +
    "read: url, optional version. list: optional limit. delete: url (permanent). open: url, shows it in the browser.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["publish", "read", "list", "delete", "open"] },
      file_path: { type: "string", description: "Local .html file to publish." },
      url: { type: "string", description: "Existing artifact url or id." },
      title: { type: "string", description: "Fallback title when the page has no <title>." },
      description: { type: "string", description: "One-sentence subtitle for the gallery." },
      icon: { type: "string", description: "One generic word, e.g. chart, map, code." },
      label: { type: "string", description: "Short name for this version." },
      version: { type: "integer", description: "read: a specific version number." },
      limit: { type: "integer", description: "list: max results (default 25)." },
    },
  },
};
