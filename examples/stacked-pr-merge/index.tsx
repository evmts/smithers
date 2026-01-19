#!/usr/bin/env bun
/**
 * Stacked PR Merge - Entry Point
 *
 * This example demonstrates a multi-phase workflow for merging worktree PRs:
 * - Phase 1: Status - Gather worktree status, identify merge candidates
 * - Phase 2: Order - Determine optimal merge order based on size/dependencies
 * - Phase 3: Rebase - Rebase branches into linear stacked history
 * - Phase 4: Merge - Cherry-pick to main, close PRs
 *
 * Key patterns demonstrated:
 * - Sequential phases with PhaseRegistry
 * - Custom hooks for async operations (useWorktreeStatus, useMergeOrder)
 * - Database-backed state management
 * - Conditional phase skipping
 * - Progress reporting via db.vcs.addReport
 *
 * Usage:
 *   bun examples/stacked-pr-merge/index.tsx [options]
 *
 * Options:
 *   --status       Only show status, don't merge
 *   --skip-rebase  Skip the rebase phase (cherry-pick directly)
 *   --no-close     Don't close PRs after merging
 *   --target <branch>  Target branch (default: main)
 */

import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'
import { StackedPRMerge } from './StackedPRMerge.js'

interface Config {
  statusOnly: boolean
  skipRebase: boolean
  closePRs: boolean
  targetBranch: string
  cwd: string
}

function parseArgs(): Config {
  const args = process.argv.slice(2)
  const config: Config = {
    statusOnly: false,
    skipRebase: false,
    closePRs: true,
    targetBranch: 'main',
    cwd: process.cwd(),
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--status':
        config.statusOnly = true
        break
      case '--skip-rebase':
        config.skipRebase = true
        break
      case '--no-close':
        config.closePRs = false
        break
      case '--target':
        config.targetBranch = args[++i] ?? 'main'
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  return config
}

function printHelp(): void {
  console.log(`
Stacked PR Merge - Merge worktree PRs into linear history

Usage:
  bun examples/stacked-pr-merge/index.tsx [options]

Options:
  --status       Only show status, don't merge
  --skip-rebase  Skip the rebase phase (cherry-pick directly)
  --no-close     Don't close PRs after merging
  --target <branch>  Target branch (default: main)
  -h, --help     Show this help

Examples:
  bun examples/stacked-pr-merge/index.tsx --status
  bun examples/stacked-pr-merge/index.tsx --skip-rebase
  bun examples/stacked-pr-merge/index.tsx --target develop
`)
}

export async function runStackedPRMerge(config: Config): Promise<void> {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('stacked-pr-merge', 'examples/stacked-pr-merge/index.tsx')

  console.log('\n' + '='.repeat(70))
  console.log('Stacked PR Merge Workflow')
  console.log('='.repeat(70))
  console.log(`Target: ${config.targetBranch}`)
  console.log(`Mode: ${config.statusOnly ? 'Status only' : 'Full merge'}`)
  console.log(`Rebase: ${config.skipRebase ? 'Skipped' : 'Enabled'}`)
  console.log(`Close PRs: ${config.closePRs ? 'Yes' : 'No'}`)
  console.log('='.repeat(70) + '\n')

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="stacked-pr-merge">
        <StackedPRMerge
          cwd={config.cwd}
          targetBranch={config.targetBranch}
          closePRs={config.closePRs}
          skipRebase={config.skipRebase}
        />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n' + '='.repeat(70))
  console.log('Workflow Complete')
  console.log('='.repeat(70))
  console.log('\nFinal State:')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

// Run if executed directly
if (import.meta.main) {
  const config = parseArgs()
  runStackedPRMerge(config).catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

// Re-export components for testing/reuse
export { StackedPRMerge } from './StackedPRMerge.js'
export { WorktreeStatusPhase } from './components/WorktreeStatusPhase.js'
export { MergeOrderPhase } from './components/MergeOrderPhase.js'
export { StackedRebasePhase } from './components/StackedRebasePhase.js'
export { MergePhase } from './components/MergePhase.js'
export { useWorktreeStatus } from './hooks/useWorktreeStatus.js'
export { useMergeOrder } from './hooks/useMergeOrder.js'
export { useStackedRebase } from './hooks/useStackedRebase.js'
export { useCherryPickMerge } from './hooks/useCherryPickMerge.js'
export type * from './types.js'
