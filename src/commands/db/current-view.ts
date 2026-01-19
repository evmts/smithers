// Current execution view for database inspection

import type { SmithersDB } from '../../db/index.js'

export async function showCurrent(db: SmithersDB) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT EXECUTION')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const execution = await db.execution.current()

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
  const phase = await db.phases.current()
  if (phase) {
    console.log(`  Current Phase: ${phase.name} (iteration ${phase.iteration})`)
    console.log(`  Phase Status: ${phase.status.toUpperCase()}`)
    console.log('')
  }

  // Show current agent
  const agent = await db.agents.current()
  if (agent) {
    console.log(`  Current Agent: ${agent.model}`)
    console.log(`  Agent Status: ${agent.status.toUpperCase()}`)
    console.log(`  Prompt: ${agent.prompt.substring(0, 100)}...`)
    console.log('')
  }

  // Show recent tool calls
  if (agent) {
    const tools = await db.tools.list(agent.id)
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
