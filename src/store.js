// File-backed artifact store. Every publish is a new immutable version;
// meta.json points at the latest one.
//
// <home>/artifacts/<id>/meta.json
// <home>/artifacts/<id>/v<n>.html

import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, basename, extname } from "node:path";

export const MAX_BYTES = 16 * 1024 * 1024;

export function home() {
  return process.env.OPEN_ARTIFACTS_HOME || join(homedir(), ".open-artifacts");
}

const ID_RE = /^[a-f0-9]{12}$/;

function dir(id) {
  if (!ID_RE.test(id)) throw new Error(`invalid artifact id: ${id}`);
  return join(home(), "artifacts", id);
}

async function readMeta(id) {
  try {
    return JSON.parse(await readFile(join(dir(id), "meta.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`artifact not found: ${id}`);
    throw err;
  }
}

export function titleFrom(html, fallback) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return (m && m[1].trim()) || fallback;
}

export async function publish({ filePath, id, title, description, icon, label }) {
  const html = await readFile(filePath, "utf8");
  if (Buffer.byteLength(html) > MAX_BYTES) throw new Error("page exceeds 16MB");

  const now = new Date().toISOString();
  let meta;
  if (id) {
    meta = await readMeta(id);
  } else {
    id = randomBytes(6).toString("hex");
    meta = { id, createdAt: now, icon: icon || "page", versions: [] };
  }

  const n = meta.versions.length + 1;
  await mkdir(dir(id), { recursive: true });
  await writeFile(join(dir(id), `v${n}.html`), html);

  meta.title = titleFrom(html, title || meta.title || basename(filePath, extname(filePath)));
  if (description !== undefined) meta.description = description;
  if (icon) meta.icon = icon;
  meta.updatedAt = now;
  meta.versions.push({ n, at: now, ...(label ? { label } : {}) });
  await writeFile(join(dir(id), "meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

export async function read(id, version) {
  const meta = await readMeta(id);
  const n = version ?? meta.versions.length;
  if (!meta.versions.some((v) => v.n === n)) throw new Error(`no version ${n} of ${id}`);
  const html = await readFile(join(dir(id), `v${n}.html`), "utf8");
  return { meta, version: n, html };
}

export async function list() {
  let ids;
  try {
    ids = await readdir(join(home(), "artifacts"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const metas = await Promise.all(ids.filter((i) => ID_RE.test(i)).map(readMeta));
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function remove(id) {
  await readMeta(id);
  await rm(dir(id), { recursive: true, force: true });
}
