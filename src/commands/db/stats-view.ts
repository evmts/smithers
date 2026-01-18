// Stats view for database inspection

export async function showStats(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('DATABASE STATISTICS')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const tables = [
    'executions',
    'phases',
    'agents',
    'tool_calls',
    'memories',
    'state',
    'transitions',
    'artifacts',
  ]

  for (const table of tables) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM ${table}`
    ) as Array<{ count: number }>
    const count = result[0]?.count || 0
    console.log(`  ${table.padEnd(15)}: ${count}`)
  }

  console.log('')
}
