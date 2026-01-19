import type { SmithersDB } from '../../db/index.js'
import { printKeyValueEntries, printSectionHeader } from './view-utils.js'

export async function showState(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'CURRENT STATE')

  const state = await db.state.getAll()

  printKeyValueEntries(state, {
    indent: '  ',
    multilineJson: true,
    emptyMessage: '(empty state)',
  })

  console.log('')
}
