/**
 * SQLite schema and initialization for round-robin agent execution system
 * Provides persistent storage for agents, execution history, and rotation state
 */

import { Database } from 'bun:sqlite'

export interface RoundRobinTables {
  agents: {
    id: string
    name: string
    type: string
    created_at: string
    updated_at: string
  }
  executions: {
    id: number
    agent_id: string
    success: number // SQLite doesn't have boolean, use 0/1
    result: string | null
    error: string | null
    execution_time: number // milliseconds
    created_at: string
  }
  round_robin_state: {
    key: string
    value: string
    updated_at: string
  }
}

/**
 * Initialize SQLite database with round-robin tables
 * Creates tables with proper indexes for efficient queries
 */
export function initializeRoundRobinDb(path: string = ':memory:'): Database {
  const db = new Database(path)

  // Enable WAL mode for better concurrent performance
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('PRAGMA cache_size = 1000')
  db.run('PRAGMA foreign_keys = ON')

  // Create agents table
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Create executions table with foreign key to agents
  db.run(`
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      success INTEGER NOT NULL CHECK (success IN (0, 1)),
      result TEXT,
      error TEXT,
      execution_time INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
    )
  `)

  // Create round_robin_state table for persisting rotation state
  db.run(`
    CREATE TABLE IF NOT EXISTS round_robin_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Create indexes for better query performance
  db.run('CREATE INDEX IF NOT EXISTS idx_agents_type ON agents (type)')
  db.run('CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON executions (agent_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions (created_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_executions_success ON executions (success)')

  // Create trigger to update updated_at timestamp
  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_agents_timestamp
    AFTER UPDATE ON agents
    BEGIN
      UPDATE agents SET updated_at = datetime('now') WHERE id = NEW.id;
    END
  `)

  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_state_timestamp
    AFTER UPDATE ON round_robin_state
    BEGIN
      UPDATE round_robin_state SET updated_at = datetime('now') WHERE key = NEW.key;
    END
  `)

  return db
}

/**
 * Prepared statements factory for common queries
 * Provides type-safe, efficient database operations
 */
export class RoundRobinQueries {
  private db: Database

  // Agent management queries
  private insertAgentStmt: any
  private selectAllAgentsStmt: any
  private selectAgentsByTypeStmt: any
  private deleteAllAgentsStmt: any

  // Execution history queries
  private insertExecutionStmt: any
  private selectExecutionHistoryStmt: any
  private selectExecutionStatsStmt: any
  private selectAgentStatsStmt: any
  private deleteAllExecutionsStmt: any

  // State management queries
  private upsertStateStmt: any
  private selectStateStmt: any
  private deleteAllStateStmt: any

  constructor(db: Database) {
    this.db = db
    this.prepareStatements()
  }

  private prepareStatements() {
    // Agent management
    this.insertAgentStmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (id, name, type)
      VALUES (?, ?, ?)
    `)

    this.selectAllAgentsStmt = this.db.prepare(`
      SELECT id, name, type, created_at, updated_at
      FROM agents
      ORDER BY created_at
    `)

    this.selectAgentsByTypeStmt = this.db.prepare(`
      SELECT id, name, type, created_at, updated_at
      FROM agents
      WHERE type = ?
      ORDER BY created_at
    `)

    this.deleteAllAgentsStmt = this.db.prepare('DELETE FROM agents')

    // Execution history
    this.insertExecutionStmt = this.db.prepare(`
      INSERT INTO executions (agent_id, success, result, error, execution_time)
      VALUES (?, ?, ?, ?, ?)
    `)

    this.selectExecutionHistoryStmt = this.db.prepare(`
      SELECT e.*, a.name as agent_name, a.type as agent_type
      FROM executions e
      JOIN agents a ON e.agent_id = a.id
      ORDER BY e.created_at DESC
      LIMIT ?
    `)

    this.selectExecutionStatsStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_executions,
        SUM(success) as successful_executions,
        AVG(execution_time) as avg_execution_time,
        MIN(execution_time) as min_execution_time,
        MAX(execution_time) as max_execution_time
      FROM executions
    `)

    this.selectAgentStatsStmt = this.db.prepare(`
      SELECT
        a.id,
        a.name,
        a.type,
        COUNT(e.id) as total_executions,
        SUM(e.success) as successful_executions,
        AVG(e.execution_time) as avg_execution_time,
        CAST(SUM(e.success) AS FLOAT) / COUNT(e.id) as success_rate
      FROM agents a
      LEFT JOIN executions e ON a.id = e.agent_id
      GROUP BY a.id, a.name, a.type
      ORDER BY a.created_at
    `)

    this.deleteAllExecutionsStmt = this.db.prepare('DELETE FROM executions')

    // State management
    this.upsertStateStmt = this.db.prepare(`
      INSERT OR REPLACE INTO round_robin_state (key, value)
      VALUES (?, ?)
    `)

    this.selectStateStmt = this.db.prepare(`
      SELECT value FROM round_robin_state WHERE key = ?
    `)

    this.deleteAllStateStmt = this.db.prepare('DELETE FROM round_robin_state')
  }

  // Agent operations
  insertAgent(agent: { id: string; name: string; type: string }) {
    return this.insertAgentStmt.run(agent.id, agent.name, agent.type)
  }

  selectAllAgents() {
    return this.selectAllAgentsStmt.all()
  }

  selectAgentsByType(type: string) {
    return this.selectAgentsByTypeStmt.all(type)
  }

  deleteAllAgents() {
    return this.deleteAllAgentsStmt.run()
  }

  // Execution operations
  insertExecution(execution: {
    agent_id: string
    success: boolean
    result?: string
    error?: string
    execution_time: number
  }) {
    return this.insertExecutionStmt.run(
      execution.agent_id,
      execution.success ? 1 : 0,
      execution.result || null,
      execution.error || null,
      execution.execution_time
    )
  }

  selectExecutionHistory(limit: number = 50) {
    return this.selectExecutionHistoryStmt.all(limit)
  }

  selectExecutionStats() {
    return this.selectExecutionStatsStmt.get()
  }

  selectAgentStats() {
    return this.selectAgentStatsStmt.all()
  }

  deleteAllExecutions() {
    return this.deleteAllExecutionsStmt.run()
  }

  // State operations
  upsertState(key: string, value: string) {
    return this.upsertStateStmt.run(key, value)
  }

  selectState(key: string): string | null {
    const result = this.selectStateStmt.get(key) as any
    return result?.value || null
  }

  deleteAllState() {
    return this.deleteAllStateStmt.run()
  }

  // Batch operations for better performance
  insertAgentsBatch(agents: Array<{ id: string; name: string; type: string }>) {
    const transaction = this.db.transaction(() => {
      for (const agent of agents) {
        this.insertAgent(agent)
      }
    })
    return transaction()
  }

  // Database maintenance
  vacuum() {
    return this.db.run('VACUUM')
  }

  getDbStats() {
    const agentCount = this.db.prepare('SELECT COUNT(*) as count FROM agents').get() as any
    const executionCount = this.db.prepare('SELECT COUNT(*) as count FROM executions').get() as any
    const stateCount = this.db.prepare('SELECT COUNT(*) as count FROM round_robin_state').get() as any

    return {
      agents: agentCount.count,
      executions: executionCount.count,
      stateEntries: stateCount.count
    }
  }

  close() {
    this.db.close()
  }
}

/**
 * Database migration utilities
 */
export class RoundRobinMigrations {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    try {
      const result = this.db.prepare(`
        SELECT value FROM round_robin_state WHERE key = 'schema_version'
      `).get() as any
      return result ? parseInt(result.value) : 0
    } catch {
      return 0
    }
  }

  /**
   * Set schema version
   */
  setVersion(version: number) {
    this.db.prepare(`
      INSERT OR REPLACE INTO round_robin_state (key, value)
      VALUES ('schema_version', ?)
    `).run(version.toString())
  }

  /**
   * Run migrations to bring database up to current version
   */
  migrate() {
    const currentVersion = this.getCurrentVersion()
    const targetVersion = 1

    if (currentVersion >= targetVersion) {
      return
    }

    // Migration v1: Add priority column to agents
    if (currentVersion < 1) {
      try {
        this.db.run('ALTER TABLE agents ADD COLUMN priority INTEGER DEFAULT 0')
        this.setVersion(1)
      } catch (error) {
        // Column might already exist, ignore
        console.warn('Migration v1 failed, column might already exist:', error)
      }
    }
  }
}