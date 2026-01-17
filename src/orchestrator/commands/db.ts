// Database inspection command

import { createSmithersDB } from '../db/index.js'
import * as path from 'path'

interface DbOptions {
  path?: string
}

export async function dbCommand(subcommand: string | undefined, options: DbOptions = {}) {
  if (!subcommand) {
    showHelp()
    return
  }

  const dbPath = options.path || '.smithers/data'

  console.log(`📊 Smithers Database Inspector`)
  console.log(`   Database: ${dbPath}`)
  console.log('')

  const db = await createSmithersDB({ path: dbPath })

  try {
    switch (subcommand) {
      case 'state':
        await showState(db)
        break

      case 'transitions':
        await showTransitions(db)
        break

      case 'executions':
        await showExecutions(db)
        break

      case 'memories':
        await showMemories(db)
        break

      case 'stats':
        await showStats(db)
        break

      case 'current':
        await showCurrent(db)
        break

      case 'recovery':
        await showRecovery(db)
        break

      default:
        showHelp()
    }
  } finally {
    await db.close()
  }
}

async function showState(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT STATE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const state = await db.state.getAll()

  if (Object.keys(state).length === 0) {
    console.log('  (empty state)')
  } else {
    for (const [key, value] of Object.entries(state)) {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n    '))
    }
  }

  console.log('')
}

async function showTransitions(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('STATE TRANSITIONS (last 20)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const transitions = await db.state.history(undefined, 20)

  if (transitions.length === 0) {
    console.log('  (no transitions)')
  } else {
    for (const t of transitions) {
      const time = new Date(t.created_at).toLocaleString()
      const oldVal = t.old_value ? JSON.stringify(t.old_value) : 'null'
      const newVal = JSON.stringify(t.new_value)
      const trigger = t.trigger || 'unknown'

      console.log(`  [${time}] ${t.key}`)
      console.log(`    ${oldVal} → ${newVal}`)
      console.log(`    Trigger: ${trigger}`)
      console.log('')
    }
  }
}

async function showExecutions(db: any) {
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

async function showMemories(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('MEMORIES')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const stats = await db.memories.stats()

  console.log(`  Total: ${stats.total}`)
  console.log('')

  console.log('  By Category:')
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${category}: ${count}`)
  }
  console.log('')

  console.log('  By Scope:')
  for (const [scope, count] of Object.entries(stats.byScope)) {
    console.log(`    ${scope}: ${count}`)
  }
  console.log('')

  // Show recent memories
  const recent = await db.memories.list(undefined, undefined, 5)

  if (recent.length > 0) {
    console.log('  Recent Memories:')
    console.log('')

    for (const m of recent) {
      console.log(`    [${m.category}] ${m.key}`)
      console.log(`      ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`)
      console.log(`      Confidence: ${m.confidence}, Source: ${m.source || 'unknown'}`)
      console.log('')
    }
  }
}

async function showStats(db: any) {
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
    const result = await db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table}`
    )
    const count = result[0]?.count || 0
    console.log(`  ${table.padEnd(15)}: ${count}`)
  }

  console.log('')
}

async function showCurrent(db: any) {
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

async function showRecovery(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CRASH RECOVERY')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const incomplete = await db.execution.findIncomplete()

  if (!incomplete) {
    console.log('  ✓ No incomplete executions found')
    console.log('  No recovery needed')
    console.log('')
    return
  }

  console.log('  ⚠️  Found incomplete execution!')
  console.log('')
  console.log(`  Name: ${incomplete.name || 'Unnamed'}`)
  console.log(`  ID: ${incomplete.id}`)
  console.log(`  File: ${incomplete.file_path}`)
  console.log(`  Started: ${new Date(incomplete.started_at!).toLocaleString()}`)
  console.log('')

  // Get last known state
  const state = await db.state.getAll()
  console.log('  Last Known State:')
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`)
  }
  console.log('')

  // Get transition history
  const transitions = await db.state.history(undefined, 5)
  console.log(`  Last ${transitions.length} Transitions:`)
  for (const t of transitions) {
    console.log(`    ${new Date(t.created_at).toLocaleString()}: ${t.key} = ${JSON.stringify(t.new_value)}`)
  }
  console.log('')

  console.log('  Recovery Options:')
  console.log('    1. Resume from last state (if possible)')
  console.log('    2. Restart from beginning')
  console.log('    3. Mark as failed and start new execution')
  console.log('')
}

function showHelp() {
  console.log('Usage: smithers db <subcommand> [options]')
  console.log('')
  console.log('Subcommands:')
  console.log('  state        Show current state')
  console.log('  transitions  Show state transition history')
  console.log('  executions   Show recent executions')
  console.log('  memories     Show memories')
  console.log('  stats        Show database statistics')
  console.log('  current      Show current execution details')
  console.log('  recovery     Check for incomplete executions (crash recovery)')
  console.log('')
  console.log('Options:')
  console.log('  --path <path>  Database path (default: .smithers/data)')
  console.log('')
}
