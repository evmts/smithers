// TUI Entry Point for Smithers Observability Dashboard
// Renders the TUI application using OpenTUI React renderer

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './App.js'

export interface TUIOptions {
  dbPath?: string
}

export async function launchTUI(options: TUIOptions = {}): Promise<void> {
  const dbPath = options.dbPath ?? '.smithers/data'

  const renderer = await createCliRenderer()
  const root = createRoot(renderer)

  root.render(<App dbPath={dbPath} />)
}

// Allow direct execution
if (import.meta.main) {
  const dbPath = process.argv[2] ?? '.smithers/data'
  launchTUI({ dbPath })
}
