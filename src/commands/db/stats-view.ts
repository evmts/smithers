import type { SmithersDB } from '../../db/index.js'
import { printSectionHeader } from './view-utils.js'

// Whitelist of allowed table names for SQL injection prevention
const ALLOWED_TABLES = new Set([
  'executions',
  'phases',
  'agents',
  'tool_calls',
  'memories',
  'state',
  'transitions',
  'artifacts',
])

export async function showStats(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'DATABASE STATISTICS')

  for (const table of ALLOWED_TABLES) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM ${table}`
    ) as Array<{ count: number }>
    const count = result[0]?.count || 0
    console.log(`  ${table.padEnd(15)}: ${count}`)
  }

  console.log('')
}
