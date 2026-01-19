// Stats view for database inspection

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

export async function showStats(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('DATABASE STATISTICS')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  for (const table of ALLOWED_TABLES) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM ${table}`
    ) as Array<{ count: number }>
    const count = result[0]?.count || 0
    console.log(`  ${table.padEnd(15)}: ${count}`)
  }

  console.log('')
}
