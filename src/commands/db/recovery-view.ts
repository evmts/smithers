// Recovery view for database inspection

import type { SmithersDB } from '../../db/index.js'

interface IncompleteExecution {
  id: string
  name?: string
  file_path: string
  started_at?: Date
}

interface Transition {
  created_at: string
  key: string
  new_value: unknown
}

export async function showRecovery(db: SmithersDB) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CRASH RECOVERY')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const incomplete: IncompleteExecution | null = await db.execution.findIncomplete()

  if (!incomplete) {
    console.log('  ✓ No incomplete executions found')
    console.log('  No recovery needed')
    console.log('')
    return
  }

  console.log('  ⚠️  Found incomplete execution!')
  console.log('')
  console.log(`  Name: ${incomplete.name || 'Unnamed'}`)
  console.log(`  ID: ${incomplete.id}`)
  console.log(`  File: ${incomplete.file_path}`)
  console.log(`  Started: ${incomplete.started_at?.toLocaleString() ?? 'Unknown'}`)
  console.log('')

  // Get last known state
  const state = await db.state.getAll()
  console.log('  Last Known State:')
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`)
  }
  console.log('')

  // Get transition history
  const transitions: Transition[] = await db.state.history(undefined, 5)
  console.log(`  Last ${transitions.length} Transitions:`)
  for (const t of transitions) {
    console.log(`    ${new Date(t.created_at).toLocaleString()}: ${t.key} = ${JSON.stringify(t.new_value)}`)
  }
  console.log('')

  console.log('  To recover, run: smithers run')
  console.log('  The orchestration will detect the incomplete state.')
  console.log('')
}
