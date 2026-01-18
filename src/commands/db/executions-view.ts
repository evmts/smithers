// Executions view for database inspection

interface Execution {
  id: string
  name?: string
  status: string
  file_path: string
  started_at?: string
  completed_at?: string
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
  error?: string
}

export async function showExecutions(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('RECENT EXECUTIONS (last 10)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const executions: Execution[] = await db.execution.list(10)

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
        console.log(`    Started: ${new Date(exec.started_at).toLocaleString()}`)
      }

      if (exec.completed_at) {
        const duration =
          new Date(exec.completed_at).getTime() - new Date(exec.started_at!).getTime()
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
