/**
 * TaskManagementAudit - Main orchestration component
 */

import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { Phase } from '../../src/components/Phase.js'
import { Ralph } from '../../src/components/Ralph.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { useQueryValue } from '../../src/reactive-sqlite/index.js'
import { WorktreeAudit } from './WorktreeAudit.js'
import { IssueAudit } from './IssueAudit.js'
import { TodoAudit } from './TodoAudit.js'
import { RootMdCleanup } from './RootMdCleanup.js'
import type { AuditState, WorktreeInfo, IssueInfo, RootMdFile } from './types.js'

function parseState<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function TaskManagementAudit(): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const stateKey = 'audit:state'

  // Load state from SQLite
  const { data: storedState } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )

  const state: AuditState = parseState(storedState, {
    worktrees: [],
    issues: [],
    todoItems: [],
    rootMdFiles: [],
    scanned: false,
  })

  const hasScannedRef = useRef(false)

  // Initial scan on mount
  useMount(() => {
    if (hasScannedRef.current || state.scanned) return
    hasScannedRef.current = true

    ;(async () => {
      try {
        console.log('[Audit] Scanning repository...')

        // Scan worktrees
        const worktreeList = await Bun.$`ls -1 .worktrees/ 2>/dev/null || echo ""`.text()
        const worktreeNames = worktreeList.trim().split('\n').filter(Boolean)
        
        const worktrees: WorktreeInfo[] = []
        for (const name of worktreeNames) {
          const mergedCheck = await Bun.$`git branch --merged main | grep "issue/${name}" || true`.text()
          worktrees.push({
            name,
            branch: `issue/${name}`,
            merged: mergedCheck.trim().length > 0,
          })
        }

        // Scan issues
        const issueList = await Bun.$`ls -1 issues/*.md 2>/dev/null | grep -v TEMPLATE || echo ""`.text()
        const issueFiles = issueList.trim().split('\n').filter(Boolean)
        
        const issues: IssueInfo[] = issueFiles.map(f => {
          const name = f.replace('issues/', '').replace('.md', '')
          return {
            name,
            hasWorktree: worktreeNames.includes(name),
            implemented: false,
          }
        })

        // Scan root .md files
        const mdFiles = ['TODO.md', 'State.md', 'PROMPT.md', 'CONTRIBUTING.md']
        const rootMdFiles: RootMdFile[] = []
        for (const path of mdFiles) {
          try {
            const content = await Bun.file(path).text()
            rootMdFiles.push({ path, hasContent: content.trim().length > 50 })
          } catch {
            // File doesn't exist
          }
        }

        // Save state
        db.state.set(stateKey, {
          worktrees,
          issues,
          todoItems: [],
          rootMdFiles,
          scanned: true,
        } as AuditState, 'audit-scan')

        console.log(`[Audit] Found ${worktrees.length} worktrees, ${issues.length} issues`)
      } catch (err) {
        console.error('[Audit] Scan failed:', err)
      }
    })()
  })

  if (!state.scanned) {
    return <audit status="scanning">Scanning repository...</audit>
  }

  return (
    <Ralph maxIterations={1}>
      <Phase name="Worktree Audit">
        <WorktreeAudit worktrees={state.worktrees} />
      </Phase>

      <Phase name="Issues Audit">
        <IssueAudit issues={state.issues} />
      </Phase>

      <Phase name="TODO Audit">
        <TodoAudit items={state.todoItems} />
      </Phase>

      <Phase name="Root MD Cleanup">
        <RootMdCleanup files={state.rootMdFiles} />
      </Phase>
    </Ralph>
  )
}
