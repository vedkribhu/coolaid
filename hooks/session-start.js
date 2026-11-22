#!/usr/bin/env node
// SessionStart hook: injects context telling the agent to display artifacts
// through this plugin's MCP server rather than any other artifact mechanism.

const context = `<coolaid>
To display an artifact (an HTML page, report, dashboard, diagram, explainer or interactive tool), use the coolaid plugin: call the \`artifact\` tool on the \`open-artifacts\` MCP server (in Claude Code: \`mcp__plugin_open-artifacts_open-artifacts__artifact\`). Use it instead of any built-in or other artifact tool. Load the \`artifacts\` skill before writing the page; it has the page contract and the publish/update loop.
</coolaid>`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  })
);
