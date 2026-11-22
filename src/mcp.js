#!/usr/bin/env node
// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0).
// Dependency-free on purpose: harnesses install plugins without running npm.

import { createInterface } from "node:readline";
import { run, TOOL } from "./actions.js";

const PROTOCOL = "2025-06-18";

const write = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

async function handle(req) {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: req.params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "open-artifacts", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call": {
      if (req.params?.name !== TOOL.name) throw Object.assign(new Error(`unknown tool ${req.params?.name}`), { code: -32602 });
      try {
        const result = await run(req.params.arguments || {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    }
    default:
      throw Object.assign(new Error(`method not found: ${req.method}`), { code: -32601 });
  }
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return write({ id: null, error: { code: -32700, message: "parse error" } });
  }
  if (req.id === undefined) return; // notification
  try {
    write({ id: req.id, result: await handle(req) });
  } catch (err) {
    write({ id: req.id, error: { code: err.code || -32603, message: err.message } });
  }
});
