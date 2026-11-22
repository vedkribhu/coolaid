#!/usr/bin/env node
// CLI for harnesses without MCP. Prints the same JSON the MCP tool returns.
//
//   artifact publish page.html [--url <id|url>] [--title T] [--description D] [--icon I] [--label L]
//   artifact read <id|url> [--version N]
//   artifact list [--limit N]
//   artifact delete <id|url>
//   artifact open <id|url>
//   artifact serve

import { parseArgs } from "node:util";
import { run } from "../src/actions.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    icon: { type: "string" },
    label: { type: "string" },
    version: { type: "string" },
    limit: { type: "string" },
  },
});

const [action, target] = positionals;

if (!action || action === "help" || action === "--help") {
  console.log("usage: artifact <publish|read|list|delete|open|serve> [target] [options]");
  process.exit(action ? 0 : 1);
}

if (action === "serve") {
  await import("../src/http.js").then(({ ensureServer, origin }) => ensureServer().then(() => console.log(origin())));
} else {
  const input = { ...values, action };
  if (values.version) input.version = Number(values.version);
  if (values.limit) input.limit = Number(values.limit);
  if (action === "publish") input.file_path = target;
  else if (target) input.url = target;
  try {
    console.log(JSON.stringify(await run(input), null, 2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
