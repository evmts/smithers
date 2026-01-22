import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { ReactiveDatabase } from '../reactive-sqlite/index.js'
// Types are re-exported from './types.js' at the bottom of this file

// Import modules
import { createStateModule, type StateModule } from './state.js'
import { createMemoriesModule, type MemoriesModule } from './memories.js'
import { createExecutionModule, type ExecutionModule } from './execution.js'
import { createPhasesModule, type PhasesModule } from './phases.js'
import { createAgentsModule, type AgentsModule } from './agents.js'
import { createStepsModule, type StepsModule } from './steps.js'
import { createTasksModule, type TasksModule } from './tasks.js'
import { createToolsModule, type ToolsModule } from './tools.js'
import { createArtifactsModule, type ArtifactsModule } from './artifacts.js'
import { createHumanModule, type HumanModule } from './human.js'
import { createVcsModule, type VcsModule } from './vcs.js'
import { createQueryModule, type QueryFunction } from './query.js'
import { createRenderFramesModule, type RenderFramesModule } from './render-frames.js'
import { createBuildStateModule, type BuildStateModule } from './build-state.js'
import { createVCSQueueModule, type VCSQueueModule } from './vcs-queue.js'

export interface SmithersDB {
  /**
   * Raw ReactiveDatabase instance (for advanced usage)
   */
  db: ReactiveDatabase

  /**
   * State management (replaces Zustand)
   */
  state: StateModule

  /**
   * Memory operations
   */
  memories: MemoriesModule

  /**
   * Execution tracking
   */
  execution: ExecutionModule

  /**
   * Phase tracking
   */
  phases: PhasesModule

  /**
   * Agent tracking
   */
  agents: AgentsModule

  /**
   * Step tracking
   */
  steps: StepsModule

  /**
   * Task tracking (for Ralph iteration management)
   */
  tasks: TasksModule

  /**
   * Tool call tracking
   */
  tools: ToolsModule

  /**
   * Artifact tracking
   */
  artifacts: ArtifactsModule

  /**
   * Human interaction tracking
   */
  human: HumanModule

  /**
   * VCS tracking
   */
  vcs: VcsModule

  /**
   * Render frame snapshots for time-travel debugging
   */
  renderFrames: RenderFramesModule

  /**
   * Build state coordination for broken builds
   */
  buildState: BuildStateModule

  /**
   * VCS operation queue for serialized git/jj operations
   */
  vcsQueue: VCSQueueModule

  /**
   * Raw query access
   */
  query: QueryFunction

  /**
   * Close the database connection
   */
  close: () => void
}

export interface SmithersDBOptions {
  path?: string
  reset?: boolean
}

/**
 * Run database migrations for existing databases.
 * This ensures new columns are added to tables that were created before schema updates.
 */
function runMigrations(rdb: ReactiveDatabase): void {
  // Migration: Add log_path column to agents table if it doesn't exist
  const agentsColumns = rdb.query<{ name: string }>('PRAGMA table_info(agents)')
  const hasLogPath = agentsColumns.some((col) => col.name === 'log_path')
  if (!hasLogPath) {
    rdb.exec('ALTER TABLE agents ADD COLUMN log_path TEXT')
  }
  const hasStreamSummary = agentsColumns.some((col) => col.name === 'stream_summary')
  if (!hasStreamSummary) {
    rdb.exec('ALTER TABLE agents ADD COLUMN stream_summary TEXT')
  }

  // Migration: Add agent_stream_events table if missing
  const streamEventsTable = rdb.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_stream_events'"
  )
  if (streamEventsTable.length === 0) {
    rdb.exec(`
      CREATE TABLE IF NOT EXISTS agent_stream_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        event_id TEXT,
        tool_name TEXT,
        content TEXT,
        timestamp INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    rdb.exec('CREATE INDEX IF NOT EXISTS idx_agent_stream_events_agent ON agent_stream_events(agent_id)')
    rdb.exec('CREATE INDEX IF NOT EXISTS idx_agent_stream_events_type ON agent_stream_events(event_type)')
    rdb.exec('CREATE INDEX IF NOT EXISTS idx_agent_stream_events_created ON agent_stream_events(created_at DESC)')
  }

  // Migration: Add interactive session columns to human_interactions table if missing
  const humanColumns = rdb.query<{ name: string }>('PRAGMA table_info(human_interactions)')
  const hasSessionConfig = humanColumns.some((col) => col.name === 'session_config')
  if (!hasSessionConfig) {
    rdb.exec('ALTER TABLE human_interactions ADD COLUMN session_config TEXT')
  }
  const hasSessionTranscript = humanColumns.some((col) => col.name === 'session_transcript')
  if (!hasSessionTranscript) {
    rdb.exec('ALTER TABLE human_interactions ADD COLUMN session_transcript TEXT')
  }
  const hasSessionDuration = humanColumns.some((col) => col.name === 'session_duration')
  if (!hasSessionDuration) {
    rdb.exec('ALTER TABLE human_interactions ADD COLUMN session_duration INTEGER')
  }
  const hasHumanError = humanColumns.some((col) => col.name === 'error')
  if (!hasHumanError) {
    rdb.exec('ALTER TABLE human_interactions ADD COLUMN error TEXT')
  }

  // Migration: Add End component columns to executions table if missing
  const executionsColumns = rdb.query<{ name: string }>('PRAGMA table_info(executions)')
  const hasEndSummary = executionsColumns.some((col) => col.name === 'end_summary')
  if (!hasEndSummary) {
    rdb.exec('ALTER TABLE executions ADD COLUMN end_summary TEXT')
  }
  const hasEndReason = executionsColumns.some((col) => col.name === 'end_reason')
  if (!hasEndReason) {
    rdb.exec('ALTER TABLE executions ADD COLUMN end_reason TEXT')
  }
  const hasExitCode = executionsColumns.some((col) => col.name === 'exit_code')
  if (!hasExitCode) {
    rdb.exec('ALTER TABLE executions ADD COLUMN exit_code INTEGER DEFAULT 0')
  }

  // Migration: Add scope_id column to tasks table if missing
  const tasksColumns = rdb.query<{ name: string }>('PRAGMA table_info(tasks)')
  const hasScopeId = tasksColumns.some((col) => col.name === 'scope_id')
  if (!hasScopeId) {
    rdb.exec('ALTER TABLE tasks ADD COLUMN scope_id TEXT')
  }
  rdb.exec('CREATE INDEX IF NOT EXISTS idx_tasks_scope ON tasks(scope_id)')
}

/**
 * Create a Smithers database instance
 */
export function createSmithersDB(options: SmithersDBOptions = {}): SmithersDB {
  // Determine database path - prefer env var from control plane, then options, then memory
  const dbPath = process.env['SMITHERS_DB_PATH'] ?? options.path ?? ':memory:'

  // Create ReactiveDatabase
  const rdb = new ReactiveDatabase(dbPath)

  // Initialize schema
  let schemaPath: string
  try {
    const currentFileUrl = import.meta.url
    if (currentFileUrl.startsWith('file://')) {
      const currentDir = path.dirname(fileURLToPath(currentFileUrl))
      // First try: schema.sql in same directory (works for non-bundled dist/src/db/)
      schemaPath = path.join(currentDir, 'schema.sql')
      
      // If bundled CLI (dist/bin/cli.js), look for schema in dist/src/db/
      if (!fs.existsSync(schemaPath) && currentDir.includes('dist/bin')) {
        const distRoot = path.resolve(currentDir, '..')
        schemaPath = path.join(distRoot, 'src', 'db', 'schema.sql')
      }
      
      // Fallback: try package root (for npm installed packages)
      if (!fs.existsSync(schemaPath)) {
        const pkgRoot = path.resolve(currentDir, '..', '..')
        const pkgSchemaPath = path.join(pkgRoot, 'dist', 'src', 'db', 'schema.sql')
        if (fs.existsSync(pkgSchemaPath)) {
          schemaPath = pkgSchemaPath
        }
      }
    } else {
      schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
    }
  } catch {
    schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
  }

  // Reset if requested
  if (options.reset) {
    const tables = ['render_frames', 'tasks', 'steps', 'reviews', 'snapshots', 'commits', 'reports', 'artifacts',
                    'transitions', 'state', 'tool_calls', 'agent_stream_events', 'agents', 'phases', 'executions',
                    'memories', 'human_interactions']
    for (const table of tables) {
      try {
        rdb.exec(`DROP TABLE IF EXISTS ${table}`)
      } catch (err) {
        if (process.env['DEBUG'] || process.env['SMITHERS_DEBUG']) {
          console.debug(`[SmithersDB] Failed to drop table ${table}:`, err)
        }
      }
    }
  }

  // Execute schema
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  rdb.exec(schemaSql)

  // Run migrations for existing databases
  runMigrations(rdb)

  let currentExecutionId: string | null = null
  let currentPhaseId: string | null = null
  let currentAgentId: string | null = null
  let currentStepId: string | null = null

  const getCurrentExecutionId = () => currentExecutionId
  const setCurrentExecutionId = (id: string | null) => { currentExecutionId = id }
  const getCurrentPhaseId = () => currentPhaseId
  const setCurrentPhaseId = (id: string | null) => { currentPhaseId = id }
  const getCurrentAgentId = () => currentAgentId
  const setCurrentAgentId = (id: string | null) => { currentAgentId = id }
  const getCurrentStepId = () => currentStepId
  const setCurrentStepId = (id: string | null) => { currentStepId = id }

  const state = createStateModule({ rdb, getCurrentExecutionId })
  const memories = createMemoriesModule({ rdb, getCurrentExecutionId })
  const execution = createExecutionModule({ rdb, getCurrentExecutionId, setCurrentExecutionId })
  const phases = createPhasesModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, setCurrentPhaseId })
  const agents = createAgentsModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentAgentId, setCurrentAgentId })
  const steps = createStepsModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentStepId, setCurrentStepId })
  const tasks = createTasksModule({ rdb, getCurrentExecutionId })
  const tools = createToolsModule({ rdb, getCurrentExecutionId })
  const artifacts = createArtifactsModule({ rdb, getCurrentExecutionId })
  const human = createHumanModule({ rdb, getCurrentExecutionId })
  const vcs = createVcsModule({ rdb, getCurrentExecutionId })
  const renderFrames = createRenderFramesModule({ rdb, getCurrentExecutionId })
  const buildState = createBuildStateModule({ rdb })
  const vcsQueue = createVCSQueueModule({ rdb, getCurrentExecutionId })
  const query = createQueryModule({ rdb })

  const db: SmithersDB = {
    db: rdb,
    state,
    memories,
    execution,
    phases,
    agents,
    steps,
    tasks,
    tools,
    artifacts,
    human,
    vcs,
    renderFrames,
    buildState,
    vcsQueue,
    query,
    close: () => {
      rdb.close()
    },
  }

  return db
}

// Re-export types
export * from './types.js'

// Re-export reactive-sqlite for direct use
export { ReactiveDatabase, useQuery, useMutation, useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'

// Re-export module types for consumers who need them
export type { StateModule } from './state.js'
export type { MemoriesModule } from './memories.js'
export type { ExecutionModule } from './execution.js'
export type { PhasesModule } from './phases.js'
export type { AgentsModule } from './agents.js'
export type { StepsModule } from './steps.js'
export type { TasksModule } from './tasks.js'
export type { ToolsModule } from './tools.js'
export type { ArtifactsModule } from './artifacts.js'
export type { HumanModule } from './human.js'
export type { VcsModule } from './vcs.js'
export type { RenderFramesModule } from './render-frames.js'
export type { BuildStateModule } from './build-state.js'
export type { VCSQueueModule, VCSQueueItem } from './vcs-queue.js'
export type { QueryFunction } from './query.js'
