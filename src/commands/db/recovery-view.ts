import type { SmithersDB } from '../../db/index.js'
import { printKeyValueEntries, printSectionHeader } from './view-utils.js'

export async function showRecovery(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'CRASH RECOVERY')

  const incomplete = await db.execution.findIncomplete()

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
  const startedAt = incomplete.started_at 
    ? (incomplete.started_at instanceof Date ? incomplete.started_at : new Date(incomplete.started_at)).toLocaleString()
    : 'Unknown'
  console.log(`  Started: ${startedAt}`)
  console.log('')

  const state = await db.state.getAll()
  console.log('  Last Known State:')
  printKeyValueEntries(state, { indent: '    ' })
  console.log('')

  const transitions = await db.state.history(undefined, 5)
  console.log(`  Last ${transitions.length} Transitions:`)
  for (const t of transitions) {
    console.log(`    ${new Date(t.created_at).toLocaleString()}: ${t.key} = ${JSON.stringify(t.new_value)}`)
  }
  console.log('')

  console.log('  To recover, run: smithers run')
  console.log('  The orchestration will detect the incomplete state.')
  console.log('')
}
