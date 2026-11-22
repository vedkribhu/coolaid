export type ArtifactRow = {
  id: string
  title: string
  description: string
  icon: string
  versions: number
  updatedAt: string
}

export type Sidebar = {
  rows: ArtifactRow[]
  /** id → epoch ms when this session last saw it published or bumped */
  fresh: Record<string, number>
  error: string | undefined
}

declare module 'claude-code' {
  interface PluginState {
    'artifacts-sidebar': { sidebar: Shaped<Sidebar> }
  }
}
