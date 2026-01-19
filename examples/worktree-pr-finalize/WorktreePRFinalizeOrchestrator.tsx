/**
 * WorktreePRFinalizeOrchestrator - Orchestrate finalization across all worktrees
 *
 * Spawns a subagent for each worktree in .worktrees/* to handle them in parallel.
 * Aggregates results and provides summary report.
 */

import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { useQueryValue } from '../../src/reactive-sqlite/index.js'

import { WorktreePRFinalize } from './WorktreePRFinalize.js'
import type { WorktreeContext, WorktreeAgentReport } from './types.js'

const STATE_KEYS = {
  worktrees: 'finalize-orchestrator:worktrees',
  reports: 'finalize-orchestrator:reports',
  phase: 'finalize-orchestrator:phase',
} as const

export interface OrchestratorProps {
  cwd?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
  deleteAfterMerge?: boolean
  parallel?: boolean // run all in parallel vs sequential
}

export function WorktreePRFinalizeOrchestrator({
  cwd = process.cwd(),
  mergeMethod = 'squash',
  deleteAfterMerge = true,
  parallel = true,
}: OrchestratorProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const initRef = useRef(false)

  // SQLite-backed state
  const { data: worktreesJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [STATE_KEYS.worktrees]
  )
  const worktrees: WorktreeContext[] = worktreesJson ? JSON.parse(worktreesJson) : []

  const { data: reportsJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [STATE_KEYS.reports]
  )
  const reports: WorktreeAgentReport[] = reportsJson ? JSON.parse(reportsJson) : []

  // Discover worktrees on mount
  useMount(() => {
    if (initRef.current) return
    initRef.current = true
    ;(async () => {
      const worktreesDir = `${cwd}/.worktrees`

      try {
        const result = await Bun.$`ls -1 ${worktreesDir}`.cwd(cwd).quiet()
        if (result.exitCode !== 0) return

        const entries = result.stdout.toString().trim().split('\n').filter(Boolean)
        const discovered: WorktreeContext[] = []

        for (const name of entries) {
          const path = `${worktreesDir}/${name}`
          const checkDir = await Bun.$`test -d ${path}`.quiet()
          if (checkDir.exitCode !== 0) continue

          discovered.push({
            name,
            path,
            branch: `issue/${name}`,
          })
        }

        db.state.set(STATE_KEYS.worktrees, discovered, 'discover-worktrees')

        db.vcs.addReport({
          type: 'progress',
          title: 'Worktrees discovered',
          content: `Found ${discovered.length} worktrees to finalize`,
        })
      } catch (err) {
        console.error('Failed to discover worktrees:', err)
      }
    })()
  })

  // Handle completion reports from subagents
  const handleComplete = (
    worktree: WorktreeContext,
    result: { success: boolean; mergedSha?: string; error?: string }
  ) => {
    const report: WorktreeAgentReport = {
      worktree: worktree.name,
      prNumber: null, // filled by subagent
      status: result.success ? 'merged' : 'failed',
      phases: {
        stackCheck: 'complete',
        rebase: 'complete',
        review: 'complete',
        push: 'complete',
        poll: 'complete',
        merge: result.success ? 'complete' : 'failed',
      },
      error: result.error,
      mergedSha: result.mergedSha,
    }

    const updated = [...reports, report]
    db.state.set(STATE_KEYS.reports, updated, 'report-complete')
  }

  // Summary stats
  const merged = reports.filter((r) => r.status === 'merged')
  const failed = reports.filter((r) => r.status === 'failed')
  const pending = worktrees.length - reports.length

  return (
    <worktree-finalize-orchestrator mode={parallel ? 'parallel' : 'sequential'}>
      <status>
        <discovered>{worktrees.length} worktrees</discovered>
        <pending>{pending}</pending>
        <merged>{merged.length}</merged>
        <failed>{failed.length}</failed>
      </status>

      {/* Spawn subagent for each worktree */}
      <agents>
        {worktrees.map((wt: WorktreeContext) => (
          <agent key={wt.name} worktree={wt.name}>
            <WorktreePRFinalize
              worktree={wt}
              mergeMethod={mergeMethod}
              deleteAfterMerge={deleteAfterMerge}
              onComplete={(result) => handleComplete(wt, result)}
            />
          </agent>
        ))}
      </agents>

      {/* Summary when all complete */}
      {reports.length === worktrees.length && worktrees.length > 0 && (
        <summary>
          <total>{worktrees.length}</total>
          <merged count={merged.length}>
            {merged.map((r) => (
              <pr key={r.worktree} worktree={r.worktree} sha={r.mergedSha} />
            ))}
          </merged>
          <failed count={failed.length}>
            {failed.map((r) => (
              <pr key={r.worktree} worktree={r.worktree} error={r.error} />
            ))}
          </failed>
        </summary>
      )}
    </worktree-finalize-orchestrator>
  )
}
