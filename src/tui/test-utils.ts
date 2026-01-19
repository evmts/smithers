import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { resetTuiState } from './state.js'

export interface TuiTestContext {
  db: SmithersDB
  root: SmithersRoot
  executionId: string
}

export function createTuiTestContext(): TuiTestContext {
  resetTuiState()
  const db = createSmithersDB({ reset: true })
  const executionId = db.execution.start('tui-test', 'test.tsx')
  const root = createSmithersRoot()
  return { db, root, executionId }
}

export function cleanupTuiTestContext(ctx: TuiTestContext): void {
  ctx.root.dispose()
  ctx.db.close()
  resetTuiState()
}

export function waitForEffects(ms: number = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
