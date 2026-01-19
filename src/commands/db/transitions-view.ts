// Transitions view for database inspection

import type { SmithersDB } from '../../db/index.js'

interface Transition {
  created_at: string
  key: string
  old_value: unknown
  new_value: unknown
  trigger?: string
}

export async function showTransitions(db: SmithersDB) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('STATE TRANSITIONS (last 20)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const transitions: Transition[] = await db.state.history(undefined, 20)

  if (transitions.length === 0) {
    console.log('  (no transitions)')
  } else {
    for (const t of transitions) {
      const time = new Date(t.created_at).toLocaleString()
      const oldVal = t.old_value ? JSON.stringify(t.old_value) : 'null'
      const newVal = JSON.stringify(t.new_value)
      const trigger = t.trigger || 'unknown'

      console.log(`  [${time}] ${t.key}`)
      console.log(`    ${oldVal} → ${newVal}`)
      console.log(`    Trigger: ${trigger}`)
      console.log('')
    }
  }
}
