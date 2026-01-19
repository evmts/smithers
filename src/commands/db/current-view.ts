import type { SmithersDB } from '../../db/index.js'
import { printKeyValueEntries, printSectionHeader } from './view-utils.js'

export async function showCurrent(db: SmithersDB) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, 'CURRENT EXECUTION')

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

  const phase = await db.phases.current()
  if (phase) {
    console.log(`  Current Phase: ${phase.name} (iteration ${phase.iteration})`)
    console.log(`  Phase Status: ${phase.status.toUpperCase()}`)
    console.log('')
  }

  const agent = await db.agents.current()
  if (agent) {
    console.log(`  Current Agent: ${agent.model}`)
    console.log(`  Agent Status: ${agent.status.toUpperCase()}`)
    console.log(`  Prompt: ${agent.prompt.substring(0, 100)}...`)
    console.log('')
  }

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

  const state = await db.state.getAll()
  console.log('  State:')
  printKeyValueEntries(state, { indent: '    ' })
  console.log('')
}
