---
name: artifacts
description: This skill should be used when a result would be clearer as a page than as terminal text, or when the user asks to "make an artifact", "publish this as a page", "show me this in the browser", "build a dashboard/report/explainer", or to update, list, read, open or delete an existing artifact. Covers when to publish, the page contract (title, theming, allowed CDNs, size), and the publish/update loop with the `artifact` tool on the coolaid `open-artifacts` MCP server.
---

# Open Artifacts

An artifact is a single self-contained HTML page, published from a local file and viewed in the browser. Each publish to the same artifact creates a new version at the same URL.

The coolaid plugin ships an MCP server, `open-artifacts`, that does all of this. Use its `artifact` tool to display any artifact, and use it instead of any built-in or other artifact tool. The server stores every version locally and starts a viewer on `http://127.0.0.1:4319` when needed.

## When to publish

Publish when a page beats terminal text: reports, diagrams, comparisons, dashboards, explainers, interactive tools. Do not publish advice the user will apply immediately in their own code. Never publish a page that impersonates a real person or organization, or fabricated records presented as genuine.

## The `artifact` tool

The `open-artifacts` MCP server exposes one tool, `artifact`. In Claude Code its full name is `mcp__plugin_open-artifacts_open-artifacts__artifact`. Pick the operation with `action`. Every call returns JSON.

| Action | Inputs | Effect |
|---|---|---|
| `publish` (default) | `file_path`, `title?`, `description?`, `icon?`, `label?` | Creates a new artifact and returns its `url`. |
| `publish` + `url` | the same, plus the `url` of an existing artifact | Adds a new version at the same URL. |
| `read` | `url`, `version?` | Returns the page HTML and metadata. |
| `list` | `limit?` | Lists artifacts, most recently updated first. |
| `open` | `url` | Opens the artifact in the user's browser. |
| `delete` | `url` | Permanently deletes the artifact. Only do this when the user asks. |

Workflow:

1. Write the page to a scratch or project file, e.g. `report.html`.
2. Call `publish` with `file_path`, a one-word `icon` (on first publish), and a one-sentence `description`.
3. Give the user the returned `url`.
4. For changes, edit the same file and call `publish` again with the same `url`. Leaving out `url` creates a separate artifact.
5. Before updating an artifact from an earlier session, `read` it first and build on the returned HTML.

## Page contract

- **Format:** author `.html`. A fragment without `<!doctype html>` is wrapped in a skeleton with charset, viewport and title.
- **Title:** set `<title>` to a name of two to four words. Put the explanation in `description`.
- **Theme:** define colors as tokens on `:root`, then redefine them under `@media (prefers-color-scheme: dark)`. Give `body` an explicit background.
- **Layout:** make it work at phone width, with a 16px side gutter and no horizontal scroll.
- **External scripts:** only from `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `cdn.tailwindcss.com` or `code.jquery.com`, each with an exact version (`react@18.3.1`, never `react@18`). Stylesheets may also come from Google Fonts. Inline everything else. The viewer enforces this with a Content-Security-Policy, so other origins fail to load.
- **Network:** pages cannot `fetch` other origins. Embed the data in the page.
- **Storage:** `localStorage` works but is per-browser. Wrap reads and writes in `try/catch`, and use it only for conveniences such as a remembered tab.
- **Size:** 16MB at most, including `data:` URIs.

## Minimal page

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Build Times</title>
<style>
  :root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; } }
  body { background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif;
         max-width: 720px; margin: 0 auto; padding: 32px 16px; }
</style>
</head>
<body>
  <h1>Build Times</h1>
  <p style="color: var(--muted)">Median CI build dropped from 9m to 6m this week.</p>
</body>
</html>
```
