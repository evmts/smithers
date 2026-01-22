import type { SmithersDB } from '../../db/index.js'
import { printKeyValueEntries, printSectionHeader } from './view-utils.js'

export async function showState(db: SmithersDB, executionId?: string) {
  const headerLine = '═══════════════════════════════════════════════════════════'

  if (executionId) {
    // Show state transitions for a specific execution
    printSectionHeader(headerLine, `STATE TRANSITIONS (execution: ${executionId})`)

    const transitions = db.state.history(undefined, 100)
    const execTransitions = transitions.filter(t => t.execution_id === executionId)

    if (execTransitions.length === 0) {
      console.log('  (no state transitions for this execution)')
    } else {
      for (const t of execTransitions) {
        const oldVal = t.old_value !== undefined ? JSON.stringify(t.old_value) : 'null'
        const newVal = JSON.stringify(t.new_value)
        console.log(`  ${t.key}: ${oldVal} -> ${newVal}`)
        if (t.trigger) {
          console.log(`    trigger: ${t.trigger}`)
        }
        console.log(`    at: ${t.created_at}`)
        console.log('')
      }
    }
  } else {
    // Show current global state
    printSectionHeader(headerLine, 'CURRENT STATE')

    const state = db.state.getAll()

    printKeyValueEntries(state, {
      indent: '  ',
      multilineJson: true,
      emptyMessage: '(empty state)',
    })
  }

  console.log('')
}
