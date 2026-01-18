// Smithers Database - SQLite-based state management
// Single source of truth for all orchestration state

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
}

/**
 * Create a Smithers database instance
 */
export function createSmithersDB(options: SmithersDBOptions = {}): SmithersDB {
  // Determine database path
  const dbPath = options.path ?? ':memory:'

  // Create ReactiveDatabase
  const rdb = new ReactiveDatabase(dbPath)

  // Initialize schema
  let schemaPath: string
  try {
    const currentFileUrl = import.meta.url
    if (currentFileUrl.startsWith('file://')) {
      const currentDir = path.dirname(fileURLToPath(currentFileUrl))
      schemaPath = path.join(currentDir, 'schema.sql')
    } else {
      schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
    }
  } catch {
    schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
  }

  // Reset if requested
  if (options.reset) {
    const tables = ['render_frames', 'tasks', 'steps', 'reviews', 'snapshots', 'commits', 'reports', 'artifacts',
                    'transitions', 'state', 'tool_calls', 'agents', 'phases', 'executions', 'memories', 'human_interactions']
    for (const table of tables) {
      try { rdb.exec(`DROP TABLE IF EXISTS ${table}`) } catch {}
    }
  }

  // Execute schema
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  rdb.exec(schemaSql)

  // Run migrations for existing databases
  runMigrations(rdb)

  // Track current execution context
  let currentExecutionId: string | null = null
  let currentPhaseId: string | null = null
  let currentAgentId: string | null = null
  let currentStepId: string | null = null

  // Context getters and setters for modules
  const getCurrentExecutionId = () => currentExecutionId
  const setCurrentExecutionId = (id: string | null) => { currentExecutionId = id }
  const getCurrentPhaseId = () => currentPhaseId
  const setCurrentPhaseId = (id: string | null) => { currentPhaseId = id }
  const getCurrentAgentId = () => currentAgentId
  const setCurrentAgentId = (id: string | null) => { currentAgentId = id }
  const getCurrentStepId = () => currentStepId
  const setCurrentStepId = (id: string | null) => { currentStepId = id }

  // Create all modules
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
export type { QueryFunction } from './query.js'
