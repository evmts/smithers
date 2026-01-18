// Current execution view for database inspection

interface Execution {
  id: string
  name?: string
  status: string
  file_path: string
}

interface Phase {
  name: string
  iteration: number
  status: string
}

interface Agent {
  id: string
  model: string
  status: string
  prompt: string
}

interface ToolCall {
  tool_name: string
  status: string
}

export async function showCurrent(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT EXECUTION')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const execution: Execution | null = await db.execution.current()

  if (!execution) {
    console.log('  (no active execution)')
    console.log('')
    return
  }

  console.log(`  Name: ${execution.name || 'Unnamed'}`)
  console.log(`  ID: ${execution.id}`)
  console.log(`  Status: ${execution.status.toUpperCase()}`)
  console.log(`  File: ${execution.file_path}`)
  console.log('')

  // Show current phase
  const phase: Phase | null = await db.phases.current()
  if (phase) {
    console.log(`  Current Phase: ${phase.name} (iteration ${phase.iteration})`)
    console.log(`  Phase Status: ${phase.status.toUpperCase()}`)
    console.log('')
  }

  // Show current agent
  const agent: Agent | null = await db.agents.current()
  if (agent) {
    console.log(`  Current Agent: ${agent.model}`)
    console.log(`  Agent Status: ${agent.status.toUpperCase()}`)
    console.log(`  Prompt: ${agent.prompt.substring(0, 100)}...`)
    console.log('')
  }

  // Show recent tool calls
  if (agent) {
    const tools: ToolCall[] = await db.tools.list(agent.id)
    if (tools.length > 0) {
      console.log(`  Recent Tool Calls (${tools.length}):`)
      for (const tool of tools.slice(-5)) {
        console.log(`    - ${tool.tool_name} (${tool.status})`)
      }
      console.log('')
    }
  }

  // Show state
  const state = await db.state.getAll()
  console.log('  State:')
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`)
  }
  console.log('')
}
