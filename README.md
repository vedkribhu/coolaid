# Open Artifacts

Open-source artifacts for any coding agent. The agent writes an HTML page and publishes it. You get a URL to view it in the browser. Each later publish to the same URL adds a new version.

It follows the Claude Artifacts model: one `artifact` tool with `publish`, `read`, `list`, `delete` and `open` actions, plus a skill that tells the agent when to publish and what a page must contain. Unlike Claude Artifacts, it runs on your machine and works with any harness that speaks MCP or can run a shell command.

## How it works

```
agent ──MCP or CLI──▶ artifact tool ──▶ store (~/.open-artifacts)
                                            │
browser ◀── http://127.0.0.1:4319/a/<id> ◀──┘ viewer (starts on demand)
```

| Part | File | Role |
|---|---|---|
| Tool | `src/actions.js` | The `publish`, `read`, `list`, `delete` and `open` actions. |
| Store | `src/store.js` | Keeps each artifact as immutable versions: `artifacts/<id>/v<n>.html` plus `meta.json`. |
| Viewer | `src/http.js` | Serves the gallery at `/` and each page at `/a/<id>[?v=n]`, on localhost only, with a CSP that enforces the CDN allowlist. |
| MCP server | `src/mcp.js` | A stdio MCP server with no dependencies. |
| CLI | `bin/artifact.js` | The same actions from a shell. |
| Skill | `skills/artifacts/SKILL.md` | When to publish, the page contract and the update loop. |

There are no dependencies, so no `npm install` step is needed. It requires Node 18 or later.

## Install

### Claude Code

```bash
claude --plugin-dir /path/to/open-artifacts        # try it locally
# or, from a git remote:
/plugin marketplace add <owner>/<repo>
/plugin install open-artifacts@open-artifacts
```

The plugin registers the MCP server and the skill.

### Other harnesses (Codex, Cursor, Gemini CLI, and others)

1. Register the MCP server. The command is `node /path/to/open-artifacts/src/mcp.js`. For example, in Codex `~/.codex/config.toml`:

   ```toml
   [mcp_servers.open-artifacts]
   command = "node"
   args = ["/path/to/open-artifacts/src/mcp.js"]
   ```

2. Copy or symlink `skills/artifacts/` into the harness's skills directory, or point `AGENTS.md` at it.

3. If the harness has no MCP support, use the CLI:

   ```bash
   node bin/artifact.js publish page.html --icon chart --description "Weekly build times"
   node bin/artifact.js publish page.html --url <id-or-url>    # new version, same URL
   node bin/artifact.js list
   node bin/artifact.js open <id-or-url>
   ```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPEN_ARTIFACTS_HOME` | `~/.open-artifacts` | Where artifacts are stored. |
| `OPEN_ARTIFACTS_PORT` | `4319` | Viewer port, bound to `127.0.0.1`. |

## Development

```bash
npm test          # store, viewer and MCP protocol tests
npm run serve     # run the viewer in the foreground
```

## Not yet built

These Claude Artifacts features are not built yet: remote hosting and share links, multi-file artifacts and assets, comments, a shared per-artifact database, and artifact types such as decks and docs.

## License

MIT
