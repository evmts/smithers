#!/usr/bin/env bun
/**
 * Worktree PR Finalize - Entry Point
 *
 * Orchestrates getting all worktree PRs into a mergeable state and merged.
 *
 * Workflow per worktree:
 * 1. Stack Check - Determine if PR is stacked on another PR
 * 2. Rebase - Rebase on origin/main
 * 3. Review - Self-review + handle GH review comments
 * 4. Push - Final rebase and force push
 * 5. Poll - Wait for CI to pass
 * 6. Merge - Merge the PR
 *
 * Usage:
 *   bun examples/worktree-pr-finalize/index.tsx [options]
 *
 * Options:
 *   --sequential     Run worktrees one at a time (default: parallel)
 *   --merge-method   Merge method: merge, squash, rebase (default: squash)
 *   --no-delete      Don't delete branch after merge
 *   --worktree NAME  Only finalize specific worktree
 *   -h, --help       Show help
 */

import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'
import { WorktreePRFinalizeOrchestrator } from './WorktreePRFinalizeOrchestrator.js'
import { WorktreePRFinalize } from './WorktreePRFinalize.js'

interface Config {
  parallel: boolean
  mergeMethod: 'merge' | 'squash' | 'rebase'
  deleteAfterMerge: boolean
  worktree: string | null
  cwd: string
}

function parseArgs(): Config {
  const args = process.argv.slice(2)
  const config: Config = {
    parallel: true,
    mergeMethod: 'squash',
    deleteAfterMerge: true,
    worktree: null,
    cwd: process.cwd(),
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sequential':
        config.parallel = false
        break
      case '--merge-method':
        config.mergeMethod = (args[++i] ?? 'squash') as Config['mergeMethod']
        break
      case '--no-delete':
        config.deleteAfterMerge = false
        break
      case '--worktree':
        config.worktree = args[++i] ?? null
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
Worktree PR Finalize - Get worktree PRs merged

Usage:
  bun examples/worktree-pr-finalize/index.tsx [options]

Options:
  --sequential       Run worktrees sequentially (default: parallel)
  --merge-method M   Merge method: merge, squash, rebase (default: squash)
  --no-delete        Don't delete branch after merge
  --worktree NAME    Only finalize specific worktree
  -h, --help         Show this help

Workflow per worktree:
  1. Stack Check - Check if stacked on unmerged PR
  2. Rebase      - Rebase on origin/main
  3. Review      - Self-review + handle GH comments
  4. Push        - Final rebase + force push
  5. Poll        - Wait for CI
  6. Merge       - Merge via gh cli

Examples:
  # Finalize all worktrees in parallel
  bun examples/worktree-pr-finalize/index.tsx

  # Finalize sequentially with merge commits
  bun examples/worktree-pr-finalize/index.tsx --sequential --merge-method merge

  # Finalize single worktree
  bun examples/worktree-pr-finalize/index.tsx --worktree fix-auth-bug
`)
}

export async function runWorktreePRFinalize(config: Config): Promise<void> {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('worktree-pr-finalize', 'examples/worktree-pr-finalize/index.tsx')

  console.log('\n' + '='.repeat(70))
  console.log('Worktree PR Finalize')
  console.log('='.repeat(70))
  console.log(`Mode: ${config.parallel ? 'Parallel' : 'Sequential'}`)
  console.log(`Merge method: ${config.mergeMethod}`)
  console.log(`Delete after merge: ${config.deleteAfterMerge}`)
  if (config.worktree) console.log(`Target worktree: ${config.worktree}`)
  console.log('='.repeat(70) + '\n')

  const root = createSmithersRoot()

  if (config.worktree) {
    // Single worktree mode
    const worktree = {
      name: config.worktree,
      path: `${config.cwd}/.worktrees/${config.worktree}`,
      branch: `issue/${config.worktree}`,
    }

    await root.mount(() => (
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <orchestration name="worktree-pr-finalize-single">
          <WorktreePRFinalize
            worktree={worktree}
            mergeMethod={config.mergeMethod}
            deleteAfterMerge={config.deleteAfterMerge}
            onComplete={(result) => {
              console.log(`\nResult: ${result.success ? 'MERGED' : 'FAILED'}`)
              if (result.mergedSha) console.log(`SHA: ${result.mergedSha}`)
              if (result.error) console.log(`Error: ${result.error}`)
            }}
          />
        </orchestration>
      </SmithersProvider>
    ))
  } else {
    // Orchestrator mode - all worktrees
    await root.mount(() => (
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <orchestration name="worktree-pr-finalize-all">
          <WorktreePRFinalizeOrchestrator
            cwd={config.cwd}
            mergeMethod={config.mergeMethod}
            deleteAfterMerge={config.deleteAfterMerge}
            parallel={config.parallel}
          />
        </orchestration>
      </SmithersProvider>
    ))
  }

  console.log('\n' + '='.repeat(70))
  console.log('Finalization Complete')
  console.log('='.repeat(70))
  console.log('\nFinal State:')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

// Run if executed directly
if (import.meta.main) {
  const config = parseArgs()
  runWorktreePRFinalize(config).catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

// Re-export for reuse
export { WorktreePRFinalize } from './WorktreePRFinalize.js'
export { WorktreePRFinalizeOrchestrator } from './WorktreePRFinalizeOrchestrator.js'
export { StackCheckPhase } from './components/StackCheckPhase.js'
export { RebasePhase } from './components/RebasePhase.js'
export { ReviewPhase } from './components/ReviewPhase.js'
export { PushPhase } from './components/PushPhase.js'
export { PollPhase } from './components/PollPhase.js'
export { MergePhase } from './components/MergePhase.js'
export type * from './types.js'
