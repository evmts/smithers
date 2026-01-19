import type { SmithersDB } from '../../db/index.js'
import { printSectionHeader } from './view-utils.js'

export async function showExecutions(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'RECENT EXECUTIONS (last 10)')

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
        const startTime = exec.started_at instanceof Date ? exec.started_at.getTime() : new Date(exec.started_at).getTime()
        const endTime = exec.completed_at instanceof Date ? exec.completed_at.getTime() : new Date(exec.completed_at).getTime()
        const duration = endTime - startTime
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
