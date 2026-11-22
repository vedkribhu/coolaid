import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'artifacts-sidebar',
  component: 'Pane',
  requestId: 'artifacts',
  props: {
    title: 'Artifacts',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const META = {
  id: 'abc123abc123',
  title: 'Q3 latency chart',
  description: 'p95 by region',
  icon: 'chart',
  createdAt: '2026-11-22T10:00:00.000Z',
  updatedAt: '2026-11-22T10:05:00.000Z',
  versions: [{ n: 1 }, { n: 2 }, { n: 3 }],
}

const engine = (on: any) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-22T10:07:00.000Z') }))
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
}

test('/sidebar opens a pane that lists the store, on every surface', async ($, on) => {
  engine(on)
  on('env.get', (_, e) => ({ value: e.name === 'OPEN_ARTIFACTS_HOME' ? '/oa' : undefined }))
  on('fs.exists', () => ({ value: true }))
  on('fs.list', () => ({
    value: [
      { name: META.id, kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'stray.txt', kind: 'file', size: 1, mtimeMs: 0, isLink: false },
    ],
  }))
  on('fs.read', () => ({ value: JSON.stringify(META) }))
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'sidebar', args: '' })
  expect(ran.text).toBe('Artifacts sidebar open: 1 artifact.')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Q3 latency chart/ }))?.text).toBe('▤ Q3 latency chart')
    expect((await ui.find({ type: 'Text', text: /v3/ }))?.text).toMatch(/▮▮▮ v3 · .* · p95 by region/)
    await ui.unmount()
  }
})

test('an empty store says so', async ($, on) => {
  engine(on)
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No artifacts/ }))?.text).toBe('No artifacts yet.')
  await ui.unmount()
})
