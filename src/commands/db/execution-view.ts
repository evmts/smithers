import type { SmithersDB } from '../../db/index.js'
import { printSectionHeader } from './view-utils.js'

export async function showExecution(db: SmithersDB, executionId: string) {
  const headerLine = '═══════════════════════════════════════════════════════════'
  printSectionHeader(headerLine, `EXECUTION: ${executionId.slice(0, 8)}...`)

  // Get execution details
  const execution = await db.execution.get(executionId)

  if (!execution) {
    console.log(`  ❌ Execution not found: ${executionId}`)
    console.log('')
    console.log('  Use `smithers db executions` to list available executions.')
    return
  }

  // Execution metadata
  console.log(`  Name: ${execution.name || 'Unnamed'}`)
  console.log(`  ID: ${execution.id}`)
  console.log(`  Status: ${execution.status.toUpperCase()}`)
  console.log(`  File: ${execution.file_path}`)

  if (execution.started_at) {
    const startTime = execution.started_at instanceof Date
      ? execution.started_at
      : new Date(execution.started_at)
    console.log(`  Started: ${startTime.toLocaleString()}`)
  }

  if (execution.completed_at && execution.started_at) {
    const startTime = execution.started_at instanceof Date
      ? execution.started_at.getTime()
      : new Date(execution.started_at).getTime()
    const endTime = execution.completed_at instanceof Date
      ? execution.completed_at.getTime()
      : new Date(execution.completed_at).getTime()
    const duration = endTime - startTime
    console.log(`  Duration: ${duration}ms`)
  }

  if (execution.error) {
    console.log(`  Error: ${execution.error}`)
  }

  console.log('')

  // Agents section
  printSectionHeader(headerLine, 'AGENTS')

  const agents = db.agents.list(executionId)

  if (agents.length === 0) {
    console.log('  (no agents)')
  } else {
    for (const agent of agents) {
      const status = agent.status?.toUpperCase() || 'UNKNOWN'
      const symbol = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '●'

      console.log(`  ${symbol} ${agent.id.slice(0, 8)}`)
      console.log(`    Model: ${agent.model}`)
      console.log(`    Status: ${status}`)

      if (agent.tokens_input || agent.tokens_output) {
        console.log(`    Tokens: ${agent.tokens_input || 0} in / ${agent.tokens_output || 0} out`)
      }

      if (agent.prompt) {
        const truncatedPrompt = agent.prompt.length > 100
          ? agent.prompt.slice(0, 100) + '...'
          : agent.prompt
        console.log(`    Prompt: ${truncatedPrompt}`)
      }

      console.log('')
    }
  }

  // Render frames section
  printSectionHeader(headerLine, 'RENDER FRAMES')

  const frames = db.renderFrames.listForExecution(executionId)

  if (frames.length === 0) {
    console.log('  (no render frames)')
  } else {
    console.log(`  Total Frames: ${frames.length}`)
    
    // Show first and last few frames
    const showFrames = frames.length <= 6 ? frames : [...frames.slice(0, 3), ...frames.slice(-3)]
    
    for (const frame of showFrames) {
      console.log(`  • Frame ${frame.sequence_number}`)
      console.log(`    Ralph Count: ${frame.ralph_count}`)
      console.log(`    Time: ${frame.created_at}`)
      console.log('')
    }
    
    if (frames.length > 6) {
      console.log(`  ... and ${frames.length - 6} more frames`)
    }
  }

  // Summary
  printSectionHeader(headerLine, 'SUMMARY')
  console.log(`  Total Agents: ${execution.total_agents}`)
  console.log(`  Total Tool Calls: ${execution.total_tool_calls}`)
  console.log(`  Total Tokens: ${execution.total_tokens_used}`)
}
