import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { openAsBlob } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const SERVER = (process.env.ARTIFACT_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = Number(process.env.MCP_PORT ?? 4000);

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

const json = async (res: Response) => {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
};

const expand = async (p: string): Promise<string[]> =>
  (await stat(p)).isDirectory()
    ? (await readdir(p, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name))
    : [p];

const ask = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

const build = () => {
  const mcp = new McpServer({ name: "artifact-server", version: "0.1.0" });

  mcp.registerTool(
    "generate",
    {
      description:
        "Upload local files and/or folders as one artifact bundle and get shareable URLs. Folders are uploaded recursively but flattened into one bundle. Use this to share files you produced (HTML, images, code, etc.) with a person or another agent.",
      inputSchema: { paths: z.array(z.string()).min(1).describe("Absolute file or folder paths to upload") },
    },
    async ({ paths }) => {
      const files = (await Promise.all(paths.map((p) => expand(resolve(p))))).flat();
      const seen = new Set<string>();
      const dupes = files.map((f) => basename(f)).filter((n) => seen.size === seen.add(n).size);
      if (dupes.length) throw new Error(`Duplicate file names (bundles are flat): ${[...new Set(dupes)].join(", ")}`);
      const fd = new FormData();
      for (const f of files) fd.append("files", await openAsBlob(f), basename(f));
      return text(await json(await fetch(`${SERVER}/artifacts`, { method: "POST", body: fd })));
    }
  );

  mcp.registerTool(
    "pull",
    {
      description:
        "Download an artifact bundle into the local workspace so you can read or edit its files. Accepts a bundle id or any URL returned by `generate`.",
      inputSchema: {
        ref: z.string().describe("Bundle id, or a share URL like http://host:3000/artifacts/<id>/<file>"),
        dir: z.string().describe("Absolute destination directory, e.g. <workspace>/.artifacts/<id>"),
      },
    },
    async ({ ref, dir }) => {
      const id = ref.match(/artifacts\/([^/?#]+)/)?.[1] ?? ref;
      const base = URL.canParse(ref) ? new URL(ref).origin : SERVER;
      const { files } = (await json(await fetch(`${base}/artifacts/${id}`))) as { files: string[] };
      const out = resolve(dir);
      await mkdir(out, { recursive: true });
      const saved = await Promise.all(
        files.map(async (name) => {
          const res = await fetch(`${base}/artifacts/${id}/${encodeURIComponent(name)}`);
          if (!res.ok) throw new Error(`${name}: ${res.status}`);
          const path = join(out, basename(name));
          await writeFile(path, Buffer.from(await res.arrayBuffer()));
          return path;
        })
      );
      return text({ id, files: saved });
    }
  );

  mcp.registerPrompt(
    "generate",
    {
      description: "Upload files or folders and get shareable artifact URLs",
      argsSchema: { paths: z.string().describe("Comma-separated file or folder paths") },
    },
    ({ paths }) =>
      ask(`Call the \`generate\` tool with these paths, made absolute against the workspace root: ${paths}. Then give me the share URLs.`)
  );

  mcp.registerPrompt(
    "pull",
    {
      description: "Download an artifact bundle into this workspace",
      argsSchema: { ref: z.string().describe("Bundle id or share URL") },
    },
    ({ ref }) =>
      ask(`Call the \`pull\` tool with ref "${ref}" and dir set to <workspace root>/.artifacts/<bundle id>. Then list the downloaded files.`)
  );

  return mcp;
};

const app = new Hono();

app.all("/mcp", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await build().connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Loopback only: the tools read and write arbitrary local paths.
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, () =>
  console.log(`MCP on http://127.0.0.1:${PORT}/mcp -> ${SERVER}`)
);
