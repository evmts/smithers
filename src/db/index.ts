import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { ReactiveDatabase } from '../reactive-sqlite/index.js'

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
import { createTicketsModule, type TicketsModule } from './tickets.js'
import { createTicketReportsModule, type TicketReportsModule } from './ticket-reports.js'

export interface SmithersDB {
  db: ReactiveDatabase
  state: StateModule
  memories: MemoriesModule
  execution: ExecutionModule
  phases: PhasesModule
  agents: AgentsModule
  steps: StepsModule
  tasks: TasksModule
  tools: ToolsModule
  artifacts: ArtifactsModule
  human: HumanModule
  vcs: VcsModule
  renderFrames: RenderFramesModule
  buildState: BuildStateModule
  vcsQueue: VCSQueueModule
  tickets: TicketsModule
  ticketReports: TicketReportsModule
  query: QueryFunction
  close: () => void
}

export interface SmithersDBOptions {
  path?: string
  reset?: boolean
}

type ColumnMigration = { table: string; column: string; sql: string }
type TableMigration = { table: string; createSql: string; indexes?: string[] }

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: 'agents', column: 'log_path', sql: 'ALTER TABLE agents ADD COLUMN log_path TEXT' },
  { table: 'agents', column: 'stream_summary', sql: 'ALTER TABLE agents ADD COLUMN stream_summary TEXT' },
  { table: 'human_interactions', column: 'session_config', sql: 'ALTER TABLE human_interactions ADD COLUMN session_config TEXT' },
  { table: 'human_interactions', column: 'session_transcript', sql: 'ALTER TABLE human_interactions ADD COLUMN session_transcript TEXT' },
  { table: 'human_interactions', column: 'session_duration', sql: 'ALTER TABLE human_interactions ADD COLUMN session_duration INTEGER' },
  { table: 'human_interactions', column: 'error', sql: 'ALTER TABLE human_interactions ADD COLUMN error TEXT' },
  { table: 'executions', column: 'end_summary', sql: 'ALTER TABLE executions ADD COLUMN end_summary TEXT' },
  { table: 'executions', column: 'end_reason', sql: 'ALTER TABLE executions ADD COLUMN end_reason TEXT' },
  { table: 'executions', column: 'exit_code', sql: 'ALTER TABLE executions ADD COLUMN exit_code INTEGER DEFAULT 0' },
  { table: 'tasks', column: 'scope_id', sql: 'ALTER TABLE tasks ADD COLUMN scope_id TEXT' },
]

const TABLE_MIGRATIONS: TableMigration[] = [
  {
    table: 'agent_stream_events',
    createSql: `CREATE TABLE IF NOT EXISTS agent_stream_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_id TEXT,
      tool_name TEXT,
      content TEXT,
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_agent_stream_events_agent ON agent_stream_events(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_stream_events_type ON agent_stream_events(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_agent_stream_events_created ON agent_stream_events(created_at DESC)',
    ],
  },
]

const STANDALONE_INDEXES = ['CREATE INDEX IF NOT EXISTS idx_tasks_scope ON tasks(scope_id)']

function runMigrations(rdb: ReactiveDatabase): void {
  const columnCache = new Map<string, Set<string>>()
  const getColumns = (table: string) => {
    if (!columnCache.has(table)) {
      const cols = rdb.query<{ name: string }>(`PRAGMA table_info(${table})`)
      columnCache.set(table, new Set(cols.map((c) => c.name)))
    }
    return columnCache.get(table)!
  }

  for (const { table, column, sql } of COLUMN_MIGRATIONS) {
    if (!getColumns(table).has(column)) rdb.exec(sql)
  }

  for (const { table, createSql, indexes } of TABLE_MIGRATIONS) {
    const exists = rdb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`
    )
    if (exists.length === 0) {
      rdb.exec(createSql)
      indexes?.forEach((idx) => rdb.exec(idx))
    }
  }

  STANDALONE_INDEXES.forEach((idx) => rdb.exec(idx))
}

export function createSmithersDB(options: SmithersDBOptions = {}): SmithersDB {
  const dbPath = process.env['SMITHERS_DB_PATH'] ?? options.path ?? ':memory:'
  const rdb = new ReactiveDatabase(dbPath)

  let schemaPath: string
  try {
    const currentFileUrl = import.meta.url
    if (currentFileUrl.startsWith('file://')) {
      const currentDir = path.dirname(fileURLToPath(currentFileUrl))
      schemaPath = path.join(currentDir, 'schema.sql')
      
      if (!fs.existsSync(schemaPath) && currentDir.includes('dist/bin')) {
        schemaPath = path.join(path.resolve(currentDir, '..'), 'src', 'db', 'schema.sql')
      }
      
      if (!fs.existsSync(schemaPath)) {
        const pkgSchemaPath = path.join(path.resolve(currentDir, '..', '..'), 'dist', 'src', 'db', 'schema.sql')
        if (fs.existsSync(pkgSchemaPath)) schemaPath = pkgSchemaPath
      }
    } else {
      schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
    }
  } catch {
    schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
  }

  if (options.reset) {
    const tables = ['ticket_reports', 'tickets', 'render_frames', 'tasks', 'steps', 'reviews', 'snapshots', 'commits', 'reports', 'artifacts',
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

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  rdb.exec(schemaSql)
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
  const tickets = createTicketsModule({ rdb })
  const ticketReports = createTicketReportsModule({ rdb, getCurrentExecutionId })
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
    tickets,
    ticketReports,
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
export type { TicketsModule, Ticket, TicketWithState, TicketStatus, TicketBudget, TicketFilter } from './tickets.js'
export type { TicketReportsModule, TicketReport, AddReportInput, ReportType, TriageAction } from './ticket-reports.js'
export type { QueryFunction } from './query.js'
