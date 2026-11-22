<div align="center">

# Open Artifacts

**Publish HTML pages from any coding agent. Get a URL. Update it in place.**

Open Artifacts gives coding agents an `artifact` tool that publishes an HTML page
to a local store and returns a link you open in the browser. Each later publish to
the same link adds a version. It also bundles a file-share server for uploading
files and folders, and a live sidebar for Claude Code.

[Install](#install) · [Highlights](#highlights) · [How it works](#how-it-works) · [Configuration](#configuration) · [Development](#development)

</div>

## Install

You need Node 18 or later and one of the supported agents.

### Claude Code

```bash
claude plugin marketplace add vedkribhu/coolaid
claude plugin install open-artifacts@open-artifacts
```

Restart Claude Code. The first session installs the file-share server's
dependencies, which takes about 20 seconds. Run `/mcp` and reconnect `artifacts`
if it shows as failed.

To try it for one session without installing, from a clone of this repository:

```bash
claude --plugin-dir /path/to/coolaid
```

To update, run `claude plugin marketplace update open-artifacts`, then
`claude plugin install open-artifacts@open-artifacts` again.

### Claude Code sidebar

A live pane of your artifacts beside the chat. Install it after the plugin:

```bash
claude plugin install artifacts-sidebar@open-artifacts
```

Restart Claude Code, then type `/sidebar`. See [Artifacts sidebar](#artifacts-sidebar).

### Codex

```bash
codex plugin marketplace add vedkribhu/coolaid
codex plugin add open-artifacts@open-artifacts
```

Restart Codex. To update, run `codex plugin marketplace upgrade open-artifacts`.

### Other agents (Cursor, Gemini CLI and others)

1. Register the MCP server. The command is `node /path/to/coolaid/src/mcp.js`. For
   example, in `~/.codex/config.toml`:

   ```toml
   [mcp_servers.open-artifacts]
   command = "node"
   args = ["/path/to/coolaid/src/mcp.js"]
   ```

2. Copy or symlink `skills/artifacts/` into the agent's skills directory, or point
   `AGENTS.md` at it.

3. If the agent has no MCP support, use the CLI:

   ```bash
   node bin/artifact.js publish page.html --icon chart --description "Weekly build times"
   node bin/artifact.js publish page.html --url <id-or-url>    # new version, same URL
   node bin/artifact.js list
   node bin/artifact.js open <id-or-url>
   ```

### Uninstall

```bash
claude plugin uninstall open-artifacts@open-artifacts
claude plugin uninstall artifacts-sidebar@open-artifacts
codex plugin remove open-artifacts
```

## Highlights

- **One tool, five actions.** `publish`, `read`, `list`, `delete` and `open` cover the whole loop.
- **Versioned in place.** Publishing to an existing URL adds a version. Earlier versions stay available at `?v=n`.
- **Runs on your machine.** The store is plain files under `~/.open-artifacts`. Nothing leaves your machine.
- **Works with any agent.** It uses MCP where the agent supports it and a CLI everywhere else.
- **A skill that writes good pages.** The bundled skill covers when to publish, the page contract and the update loop.
- **File sharing.** The `generate` and `pull` tools upload files and folders to a local server and download them again.
- **Live sidebar.** A Claude Code mod lists your artifacts and flags what just changed.

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
| Hook | `hooks/session-start.js` | Tells the agent to display artifacts through this plugin's MCP server. |
| File-share server | `share-server/` | An HTTP server on port 3000 and an MCP endpoint on port 4000. |
| Share hook | `hooks/start-share-server.js` | Installs the file-share server's dependencies and starts both processes. |

The artifact tool has no dependencies, so it needs no `npm install` step.

## File sharing

The `artifacts` MCP server exposes two tools backed by `share-server/`.

| Tool | Input | Does |
|---|---|---|
| `generate` | `paths`: absolute file or folder paths | Uploads the files as one bundle and returns `{ id, urls }`. Folders are walked recursively and flattened. Duplicate file names are rejected. |
| `pull` | `ref`: bundle id or share URL, `dir`: absolute destination | Downloads every file in the bundle to `dir`. |

On Claude Code, the session-start hook starts the servers for you. Uploads are
stored under `$CLAUDE_PLUGIN_DATA/artifacts`, or `~/.coolaid-share/artifacts` when
that is unset, and expire after 24 hours. The log is `share-server.log` in the same folder.

To run the servers yourself:

```bash
cd share-server
npm install
npm run dev                 # file server on :3000
npx tsx mcp.ts              # MCP endpoint on :4000
```

The file server has no authentication. The unguessable bundle id in each URL is the
only access control. The MCP endpoint binds to `127.0.0.1` because its tools read and
write local paths.

## Artifacts sidebar

`mods/artifacts-sidebar/` is a Claude Code mod that keeps a live pane of your
artifacts beside the chat. Type `/sidebar` to open it.

- Lists every artifact in the store, newest first, with its version count, age and description. It reads the store directly, so it also shows pages that other agents published.
- Marks artifacts that changed in the last 10 minutes in green.
- Press a row, or its number key `1`–`9`, to open that page in the browser. Press `g` for the gallery and `r` to refresh.
- Shows a toast when the `artifact` tool publishes, and an artifact count in the status line.

To try it for one session, run `claude --plugin-dir mods/artifacts-sidebar`. Run its
tests with `claude plugin test mods/artifacts-sidebar`. The sidebar does not list files
uploaded through the file-share server.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPEN_ARTIFACTS_HOME` | `~/.open-artifacts` | Where artifacts are stored. |
| `OPEN_ARTIFACTS_PORT` | `4319` | Viewer port, bound to `127.0.0.1`. |
| `ARTIFACT_SERVER_URL` | `http://localhost:3000` | File server that the `artifacts` MCP server talks to. |
| `MCP_PORT` | `4000` | Port of the `artifacts` MCP endpoint. |
| `BASE_URL` | this machine's LAN address | Prefix of the share URLs the file server returns. |
| `TTL_HOURS` | `24` | How long uploaded bundles live. |

## Development

```bash
npm test          # store, viewer and MCP protocol tests
npm run serve     # run the viewer in the foreground
```

## Not yet built

These Claude Artifacts features are not built yet: remote hosting and share links,
multi-file artifacts and assets, comments, a shared per-artifact database, and
artifact types such as decks and docs.

## License

MIT
