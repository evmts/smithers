// State view for database inspection

import type { SmithersDB } from '../../db/index.js'

export async function showState(db: SmithersDB) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT STATE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const state = await db.state.getAll()

  if (Object.keys(state).length === 0) {
    console.log('  (empty state)')
  } else {
    for (const [key, value] of Object.entries(state)) {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n    '))
    }
  }

  console.log('')
}
