#!/bin/sh
# stdio entry for harnesses without plugin hooks (Codex): start the share
# servers if needed, wait for the MCP port, then bridge stdio to it.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
node "$DIR/hooks/start-share-server.js" >/dev/null
i=0; until nc -z 127.0.0.1 4000 2>/dev/null; do i=$((i+1)); [ $i -gt 300 ] && exit 1; sleep 0.2; done
exec npx -y mcp-remote http://127.0.0.1:4000/mcp
