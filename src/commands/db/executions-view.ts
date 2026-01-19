// Executions view for database inspection

import type { SmithersDB } from '../../db/index.js'

export async function showExecutions(db: SmithersDB) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('RECENT EXECUTIONS (last 10)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const executions = await db.execution.list(10)

  if (executions.length === 0) {
    console.log('  (no executions)')
  } else {
    for (const exec of executions) {
      const status = exec.status.toUpperCase()
      const symbol = status === 'COMPLETED' ? '✓' : status === 'FAILED' ? '✗' : '●'

      console.log(`  ${symbol} ${exec.name || 'Unnamed'}`)
      console.log(`    ID: ${exec.id}`)
      console.log(`    Status: ${status}`)
      console.log(`    File: ${exec.file_path}`)

      if (exec.started_at) {
        console.log(`    Started: ${exec.started_at.toLocaleString()}`)
      }

      if (exec.completed_at && exec.started_at) {
        const duration = exec.completed_at.getTime() - exec.started_at.getTime()
        console.log(`    Duration: ${duration}ms`)
      }

      console.log(`    Agents: ${exec.total_agents}, Tools: ${exec.total_tool_calls}, Tokens: ${exec.total_tokens_used}`)

      if (exec.error) {
        console.log(`    Error: ${exec.error}`)
      }

      console.log('')
    }
  }
}
