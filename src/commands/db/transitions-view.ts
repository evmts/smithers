import type { SmithersDB } from '../../db/index.js'
import type { Transition } from '../../db/types.js'
import { printSectionHeader } from './view-utils.js'

export async function showTransitions(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'STATE TRANSITIONS (last 20)')

  const transitions: Transition[] = await db.state.history(undefined, 20)

  if (transitions.length === 0) {
    console.log('  (no transitions)')
  } else {
    for (const t of transitions) {
      const time = new Date(t.created_at).toLocaleString()
      const oldVal = t.old_value !== null && t.old_value !== undefined ? JSON.stringify(t.old_value) : 'null'
      const newVal = JSON.stringify(t.new_value)
      const trigger = t.trigger || 'unknown'

      console.log(`  [${time}] ${t.key}`)
      console.log(`    ${oldVal} → ${newVal}`)
      console.log(`    Trigger: ${trigger}`)
      console.log('')
    }
  }
}
