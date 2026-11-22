import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArtifactRow, Sidebar } from '../types'

// A live sidebar of the Open Artifacts store (~/.open-artifacts). It reads the
// store itself, so it also shows pages published by other harnesses.

const PANE = 'artifacts'
const TITLE = 'Artifacts'
const FRESH_MS = 10 * 60 * 1000
const POLL_MS = 10 * 1000

const sidebar = atom(
  { plugin: 'artifacts-sidebar', key: 'sidebar' } as const,
  { rows: [], fresh: {}, error: undefined } as Sidebar,
  { shape: 'sidebar-1' },
)

const GLYPH: Record<string, string> = {
  chart: '▤', map: '◎', code: '‹›', table: '▦', doc: '¶', page: '◇',
  game: '♠', diagram: '◈', calendar: '▣', recipe: '❦', report: '¶',
}
const glyph = (icon: string) => GLYPH[icon] ?? '◇'

const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

const clip = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`

// Is this tool call the open-artifacts tool, over MCP or its CLI?
const isArtifactCall = (tool: string, input: unknown) => {
  if (/^mcp__.*open-artifacts.*__artifact$/.test(tool)) return true
  const command = (input as { command?: unknown }).command
  return tool === 'Bash' && typeof command === 'string' && /artifact\.js|\bartifact (publish|delete)/.test(command)
}

const home = async ($: EngineInterface) => {
  const own = await $.env.get('OPEN_ARTIFACTS_HOME')
  return own ?? `${(await $.env.get('HOME')) ?? '~'}/.open-artifacts`
}

const origin = async ($: EngineInterface) => `http://127.0.0.1:${(await $.env.get('OPEN_ARTIFACTS_PORT')) ?? '4319'}`

const scan = async ($: EngineInterface): Promise<ArtifactRow[]> => {
  const root = `${await home($)}/artifacts`
  if (!(await $.fs.exists(root))) return []
  const dirs = (await $.fs.list(root)).filter(d => d.kind === 'dir' && /^[a-f0-9]{12}$/.test(d.name))
  const rows = await Promise.all(
    dirs.map(async d => {
      try {
        const m = JSON.parse(await $.fs.read(`${root}/${d.name}/meta.json`))
        return {
          id: m.id,
          title: m.title ?? m.id,
          description: m.description ?? '',
          icon: m.icon ?? 'page',
          versions: m.versions?.length ?? 0,
          updatedAt: m.updatedAt ?? m.createdAt,
        } as ArtifactRow
      } catch {
        return undefined
      }
    }),
  )
  return rows
    .filter((r): r is ArtifactRow => r !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

// Rescan, mark what changed since last time as fresh, announce it.
const refresh = async ($: EngineInterface, { announce }: { announce: boolean }) => {
  const before = await read($, sidebar)
  let rows: ArtifactRow[]
  try {
    rows = await scan($)
  } catch (err) {
    await update($, sidebar, s => ({ ...s, error: String(err) }))
    return
  }
  const now = await $.clock.now()
  const known = new Map(before.rows.map(r => [r.id, r]))
  const changed = before.rows.length === 0 && !announce ? [] : rows.filter(r => known.get(r.id)?.updatedAt !== r.updatedAt)
  const gone = before.rows.length - rows.filter(r => known.has(r.id)).length

  const same = changed.length === 0 && gone === 0 && rows.length === before.rows.length
  if (!same || before.error) {
    await update($, sidebar, s => {
      const fresh = { ...s.fresh }
      for (const r of changed) fresh[r.id] = now
      for (const id of Object.keys(fresh)) if (now - (fresh[id] ?? 0) > FRESH_MS) delete fresh[id]
      return { rows, fresh, error: undefined }
    })
  }

  $.ui.status(rows.length ? `◇ ${rows.length} artifact${rows.length === 1 ? '' : 's'}` : undefined)
  const r = changed[0]
  if (announce && r) {
    $.ui.toast(r.versions > 1 ? `◆ ${r.title} → v${r.versions}` : `◆ Published ${r.title}`)
  }
}

const openUrl = async ($: EngineInterface, url: string) => {
  const os = (await $.env.get('OSTYPE')) ?? ''
  const argv = os.startsWith('linux') ? ['xdg-open', url] : ['open', url]
  const ran = await $.process.run(argv).catch(() => undefined)
  if (!ran || ran.exitCode !== 0) $.ui.toast(`Open ${url} in your browser`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sidebar',
      description: 'Open the Artifacts sidebar: every Open Artifact, live',
    })
    await refresh($, { announce: false })
    $.clock.every(POLL_MS, () => void refresh($, { announce: true }))

    return next(e)
  })

  on('command.run', { command: 'sidebar' }, async $ => {
    await refresh($, { announce: false })
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    const { rows } = await read($, sidebar)

    return {
      text: isPlaced
        ? `Artifacts sidebar open: ${rows.length} artifact${rows.length === 1 ? '' : 's'}.`
        : 'Artifacts sidebar queued: the window is too narrow to seat it right now.',
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (isArtifactCall(e.tool, e)) await refresh($, { announce: true })

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { rows, fresh, error } = await read($, sidebar)
    const now = await $.clock.now()
    const base = await origin($)
    const width = Math.max(16, (e.props?.bodyColumns ?? 40) - 2)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 6) / 2))

    return (
      <Box flexDirection="column">
        {error && <Text color="red">{clip(error, width)}</Text>}
        {rows.length === 0 && !error && (
          <Box flexDirection="column">
            <Text dimColor>No artifacts yet.</Text>
            <Text dimColor>Ask Claude to publish a page.</Text>
          </Box>
        )}
        {rows.slice(0, room).map((r, i) => {
          const isFresh = fresh[r.id] !== undefined
          const pips = '▮'.repeat(Math.min(r.versions, 6)) + (r.versions > 6 ? '+' : '')
          const meta = `${pips} v${r.versions} · ${ago(r.updatedAt, now)}`
          return (
            <Box key={r.id} flexDirection="column">
              <Button
                key={r.id}
                plain
                hotkey={i < 9 ? String(i + 1) : undefined}
                onPress={() => openUrl($, `${base}/a/${r.id}`)}
              >
                <Text color={isFresh ? 'green' : undefined} bold={isFresh}>
                  {glyph(r.icon)} {clip(r.title, width - 8)}
                </Text>
                {isFresh ? <Text color="green"> {r.versions > 1 ? '↑' : 'new'}</Text> : ''}
              </Button>
              <Text dimColor>  {clip(r.description ? `${meta} · ${r.description}` : meta, width - 2)}</Text>
            </Box>
          )
        })}
        {rows.length > room && <Text dimColor>+{rows.length - room} more in the gallery</Text>}
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Button key="gallery" hotkey="g" onPress={() => openUrl($, `${base}/`)}>Gallery</Button>
          <Button key="refresh" hotkey="r" onPress={() => refresh($, { announce: true })}>Refresh</Button>
        </Box>
      </Box>
    )
  })
}
