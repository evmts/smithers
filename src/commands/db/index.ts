import { existsSync } from 'node:fs'
import { createSmithersDB } from '../../db/index.js'
import { resolveDbPaths } from '../cli-utils.js'
import { showState } from './state-view.js'
import { showTransitions } from './transitions-view.js'
import { showExecutions } from './executions-view.js'
import { showExecution } from './execution-view.js'
import { showMemories } from './memories-view.js'
import { showStats } from './stats-view.js'
import { showCurrent } from './current-view.js'
import { showRecovery } from './recovery-view.js'
import { showHelp } from './help.js'

interface DbOptions {
  path?: string
  executionId?: string
}

export async function dbCommand(subcommand: string | undefined, options: DbOptions = {}, args: string[] = []) {
  if (!subcommand) {
    showHelp()
    return
  }

  const { requestedPath, dbFile } = resolveDbPaths(options.path)

  if (!existsSync(dbFile)) {
    console.error(`❌ Database not found: ${dbFile}`)
    console.error('')
    console.error('Did you run `smithers init` and `smithers run` first?')
    process.exit(1)
  }

  console.log(`📊 Smithers Database Inspector`)
  console.log(`   Database: ${requestedPath}`)
  console.log('')

  const db = createSmithersDB({ path: dbFile })

  try {
    switch (subcommand) {
      case 'state':
        await showState(db, options.executionId)
        break

      case 'transitions':
        await showTransitions(db)
        break

      case 'executions':
        await showExecutions(db)
        break

      case 'execution': {
        const executionId = args[0]
        if (!executionId) {
          console.error('Missing execution ID')
          console.error('')
          console.error('Usage: smithers db execution <execution-id>')
          process.exit(1)
        }
        await showExecution(db, executionId)
        break
      }

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
        console.error(`Unknown subcommand: ${subcommand}`)
        console.error('')
        showHelp()
        process.exit(1)
    }
  } finally {
    await db.close()
  }
}

export { showState } from './state-view.js'
export { showTransitions } from './transitions-view.js'
export { showExecutions } from './executions-view.js'
export { showExecution } from './execution-view.js'
export { showMemories } from './memories-view.js'
export { showStats } from './stats-view.js'
export { showCurrent } from './current-view.js'
export { showRecovery } from './recovery-view.js'
export { showHelp } from './help.js'
