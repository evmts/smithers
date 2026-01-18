#!/usr/bin/env bun

import { Command } from 'commander'
import { init } from '../src/orchestrator/commands/init.ts'
import { run } from '../src/orchestrator/commands/run.ts'
import { monitor } from '../src/orchestrator/commands/monitor.ts'
import { dbCommand } from '../src/orchestrator/commands/db.ts'

const program = new Command()

program
  .name('smithers')
  .description('CLI tool for multi-agent AI orchestration with Smithers framework')
  .version('0.1.0')

program
  .command('init')
  .description('Create a new Smithers orchestration in .smithers/')
  .option('-d, --dir <directory>', 'Directory to create .smithers in', process.cwd())
  .action(init)

program
  .command('run [file]')
  .description('Run a Smithers orchestration file')
  .option('-f, --file <file>', 'Orchestration file to run', '.smithers/main.tsx')
  .action(run)

program
  .command('monitor [file]')
  .description('Run with LLM-friendly monitoring (recommended)')
  .option('-f, --file <file>', 'Orchestration file to monitor', '.smithers/main.tsx')
  .option('--no-summary', 'Disable Haiku summarization')
  .action(monitor)

program
  .command('db [subcommand]')
  .description('Inspect and manage the PGlite database')
  .option('--path <path>', 'Database path', '.smithers/data')
  .action(dbCommand)

// Hook trigger command - called by git hooks to notify orchestration
program
  .command('hook-trigger <type> <data>')
  .description('Trigger a hook event (used by git hooks)')
  .option('--path <path>', 'Database path', '.smithers/data')
  .action(async (type: string, data: string, options: { path: string }) => {
    try {
      // Dynamically import to avoid loading DB on every CLI call
      const { createSmithersDB } = await import('../src/orchestrator/db/index.ts')

      const db = await createSmithersDB({ path: options.path })

      // Store the trigger in state
      await db.state.set('last_hook_trigger', {
        type,
        data,
        timestamp: Date.now(),
      })

      await db.close()

      console.log(`[Hook] Triggered: ${type} with ${data}`)
    } catch (error) {
      console.error('[Hook] Error:', error)
      process.exit(1)
    }
  })

program.parse(process.argv)
