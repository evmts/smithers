/**
 * Task Management Audit - Entry Point
 *
 * This example demonstrates a multi-phase audit of repository task management:
 * - Phase 1: Audit worktrees (delete merged branches)
 * - Phase 2: Audit issues (delete implemented, spawn subagents for unimplemented)
 * - Phase 3: Audit TODO.md (implement remaining items on main)
 * - Phase 4: Cleanup root .md files
 *
 * Key patterns demonstrated:
 * - Sequential phases with PhaseRegistry
 * - Parallel subagent execution within phases
 * - Conditional rendering with <If>
 * - Database-backed state management
 * - Worktree component for isolated branch work
 */

import { SmithersProvider } from '../../src/components/SmithersProvider.js'
import { createSmithersDB } from '../../src/db/index.js'
import { createSmithersRoot } from '../../src/reconciler/index.js'
import { TaskManagementAudit } from './TaskManagementAudit.js'

export async function runTaskManagementAudit(): Promise<void> {
  const db = createSmithersDB({ path: ':memory:' })
  
  // Start execution - this sets the current execution context
  const executionId = db.execution.start('task-management-audit', 'examples/task-management-audit/index.tsx')

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="task-management-audit">
        <TaskManagementAudit />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\n=== Audit Complete ===')
  console.log(root.toXML())
  
  // Complete execution
  db.execution.complete(executionId)
  db.close()
}

// Run if executed directly
if (import.meta.main) {
  runTaskManagementAudit().catch(console.error)
}

// Re-export components for testing
export { TaskManagementAudit } from './TaskManagementAudit.js'
export { WorktreeAudit } from './WorktreeAudit.js'
export { IssueAudit } from './IssueAudit.js'
export { TodoAudit } from './TodoAudit.js'
export { RootMdCleanup } from './RootMdCleanup.js'
export type * from './types.js'
