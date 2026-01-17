// Smithers Database - PGlite-based state management
// Single source of truth for all orchestration state

import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs/promises'
import * as path from 'path'
import { StateManager } from './state.js'
import { MemoryManager } from './memories.js'
import { ExecutionManager } from './execution.js'
import { VCSManager } from './vcs.js'
import { QueryHelpers } from './live-query.js'
import type {
  Memory,
  MemoryInput,
  Execution,
  Phase,
  Agent,
  ToolCall,
  Artifact,
  Commit,
  Snapshot,
  Review,
  Report,
  Step,
} from './types.js'

export interface SmithersDB {
  /**
   * Raw PGlite instance (for advanced usage)
   */
  pg: PGlite

  /**
   * Get VCS manager for a specific execution
   */
  getVCSManager: (executionId: string) => VCSManager

  /**
   * State management (replaces Zustand)
   * All state changes are logged to transitions table
   */
  state: {
    /**
     * Get a state value
     */
    get: <T>(key: string) => Promise<T | null>

    /**
     * Set a state value with transition logging
     */
    set: <T>(key: string, value: T, trigger?: string) => Promise<void>

    /**
     * Set multiple state values atomically
     */
    setMany: (updates: Record<string, any>, trigger?: string) => Promise<void>

    /**
     * Get all state as an object
     */
    getAll: () => Promise<Record<string, any>>

    /**
     * Reset state to defaults
     */
    reset: () => Promise<void>

    /**
     * Get state transition history
     */
    history: (key?: string, limit?: number) => Promise<any[]>

    /**
     * Replay state to a specific point (time-travel debugging)
     */
    replayTo: (transitionId: string) => Promise<void>

    /**
     * Create a snapshot of current state
     */
    snapshot: () => Promise<Record<string, any>>

    /**
     * Restore state from a snapshot
     */
    restore: (snapshot: Record<string, any>, trigger?: string) => Promise<void>
  }

  /**
   * Memory operations - long-term knowledge
   */
  memories: {
    /**
     * Add a new memory
     */
    add: (memory: MemoryInput) => Promise<string>

    /**
     * Get a specific memory
     */
    get: (category: string, key: string, scope?: string) => Promise<Memory | null>

    /**
     * List memories by category/scope
     */
    list: (category?: string, scope?: string, limit?: number) => Promise<Memory[]>

    /**
     * Search memories by content
     */
    search: (query: string, category?: string, limit?: number) => Promise<Memory[]>

    /**
     * Update a memory
     */
    update: (id: string, updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>) => Promise<void>

    /**
     * Delete a memory
     */
    delete: (id: string) => Promise<void>

    /**
     * Convenience methods for specific memory types
     */
    addFact: (key: string, content: string, source?: string) => Promise<string>
    addLearning: (key: string, content: string, source?: string) => Promise<string>
    addPreference: (key: string, content: string, scope?: 'global' | 'project' | 'session') => Promise<string>

    /**
     * Get memory statistics
     */
    stats: () => Promise<{
      total: number
      byCategory: Record<string, number>
      byScope: Record<string, number>
    }>
  }

  /**
   * Execution tracking
   */
  execution: {
    /**
     * Start a new execution
     */
    start: (name: string, filePath: string, config?: Record<string, any>) => Promise<string>

    /**
     * Complete the execution
     */
    complete: (id: string, result?: Record<string, any>) => Promise<void>

    /**
     * Mark execution as failed
     */
    fail: (id: string, error: string) => Promise<void>

    /**
     * Cancel an execution
     */
    cancel: (id: string) => Promise<void>

    /**
     * Get current execution
     */
    current: () => Promise<Execution | null>

    /**
     * Get execution by ID
     */
    get: (id: string) => Promise<Execution | null>

    /**
     * List recent executions
     */
    list: (limit?: number) => Promise<Execution[]>

    /**
     * Find incomplete execution (for crash recovery)
     */
    findIncomplete: () => Promise<Execution | null>
  }

  /**
   * Phase tracking
   */
  phases: {
    /**
     * Start a new phase
     */
    start: (name: string, iteration?: number) => Promise<string>

    /**
     * Complete a phase
     */
    complete: (id: string) => Promise<void>

    /**
     * Mark phase as failed
     */
    fail: (id: string) => Promise<void>

    /**
     * Get current phase
     */
    current: () => Promise<Phase | null>

    /**
     * Get phases for execution
     */
    list: (executionId: string) => Promise<Phase[]>
  }

  /**
   * Agent tracking
   */
  agents: {
    /**
     * Start a new agent execution
     */
    start: (prompt: string, model?: string, systemPrompt?: string) => Promise<string>

    /**
     * Complete an agent execution
     */
    complete: (
      id: string,
      result: string,
      structuredResult?: Record<string, any>,
      tokens?: { input: number; output: number }
    ) => Promise<void>

    /**
     * Mark agent as failed
     */
    fail: (id: string, error: string) => Promise<void>

    /**
     * Get current agent
     */
    current: () => Promise<Agent | null>

    /**
     * Get agents for execution
     */
    list: (executionId: string) => Promise<Agent[]>
  }

  /**
   * Tool call tracking
   */
  tools: {
    /**
     * Log a tool call start
     */
    start: (agentId: string, toolName: string, input: Record<string, any>) => Promise<string>

    /**
     * Complete a tool call
     */
    complete: (id: string, output: string, summary?: string) => Promise<void>

    /**
     * Mark tool call as failed
     */
    fail: (id: string, error: string) => Promise<void>

    /**
     * Get tool calls for agent
     */
    list: (agentId: string) => Promise<ToolCall[]>

    /**
     * Get tool call output (handles inline and file-based)
     */
    getOutput: (id: string) => Promise<string | null>
  }

  /**
   * Step tracking
   */
  steps: {
    /**
     * Start a new step
     */
    start: (executionId: string, name?: string) => Promise<string>

    /**
     * Complete a step
     */
    complete: (id: string, vcsInfo?: {
      snapshot_before?: string
      snapshot_after?: string
      commit_created?: string
    }) => Promise<void>

    /**
     * Mark step as failed
     */
    fail: (id: string) => Promise<void>

    /**
     * Get current step
     */
    current: () => Promise<Step | null>

    /**
     * Get steps for phase
     */
    list: (phaseId: string) => Promise<Step[]>

    /**
     * Get steps for execution
     */
    getByExecution: (executionId: string) => Promise<Step[]>
  }

  /**
   * Artifact tracking
   */
  artifacts: {
    /**
     * Add an artifact (file/code reference)
     */
    add: (
      name: string,
      type: Artifact['type'],
      filePath: string,
      agentId?: string,
      metadata?: Record<string, any>
    ) => Promise<string>

    /**
     * Get artifacts for execution
     */
    list: (executionId: string) => Promise<Artifact[]>
  }

  /**
   * VCS tracking - commits, snapshots, reviews, reports
   */
  vcs: {
    /**
     * Log a commit
     */
    logCommit: (commit: {
      vcs_type: 'git' | 'jj'
      commit_hash: string
      change_id?: string
      message: string
      author?: string
      files_changed?: string[]
      insertions?: number
      deletions?: number
      smithers_metadata?: Record<string, any>
      agent_id?: string
    }) => Promise<string>

    /**
     * Get commits for current execution
     */
    getCommits: (limit?: number) => Promise<Commit[]>

    /**
     * Get a specific commit
     */
    getCommit: (hash: string, vcsType?: 'git' | 'jj') => Promise<Commit | null>

    /**
     * Log a JJ snapshot
     */
    logSnapshot: (snapshot: {
      change_id: string
      commit_hash?: string
      description?: string
      files_modified?: string[]
      files_added?: string[]
      files_deleted?: string[]
      has_conflicts?: boolean
    }) => Promise<string>

    /**
     * Get snapshots for current execution
     */
    getSnapshots: (limit?: number) => Promise<Snapshot[]>

    /**
     * Log a code review
     */
    logReview: (review: {
      target_type: 'commit' | 'diff' | 'pr' | 'files'
      target_ref?: string
      approved: boolean
      summary: string
      issues: any[]
      approvals?: any[]
      reviewer_model?: string
      blocking?: boolean
      agent_id?: string
    }) => Promise<string>

    /**
     * Update review posting status
     */
    updateReview: (id: string, updates: {
      posted_to_github?: boolean
      posted_to_git_notes?: boolean
    }) => Promise<void>

    /**
     * Get reviews for current execution
     */
    getReviews: (limit?: number) => Promise<Review[]>

    /**
     * Get blocking reviews that failed
     */
    getBlockingReviews: () => Promise<Review[]>

    /**
     * Add a report from an agent
     */
    addReport: (report: {
      type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
      title: string
      content: string
      data?: Record<string, any>
      severity?: 'info' | 'warning' | 'critical'
      agent_id?: string
    }) => Promise<string>

    /**
     * Get reports, optionally filtered by type
     */
    getReports: (type?: Report['type'], limit?: number) => Promise<Report[]>

    /**
     * Get critical reports
     */
    getCriticalReports: () => Promise<Report[]>
  }

  /**
   * Raw query access
   */
  query: <T>(sql: string, params?: any[]) => Promise<T[]>

  /**
   * Close the database connection
   */
  close: () => Promise<void>
}

export interface SmithersDBOptions {
  /**
   * Path to persist database
   * - undefined: in-memory only
   * - string: file path or indexedDB name
   */
  path?: string

  /**
   * Reset database on startup
   */
  reset?: boolean

  /**
   * Custom schema SQL (for extensions)
   */
  customSchema?: string
}

/**
 * Create a Smithers database instance
 */
export async function createSmithersDB(
  options: SmithersDBOptions = {}
): Promise<SmithersDB> {
  // Create PGlite instance
  const pg = await PGlite.create({
    dataDir: options.path,
  })

  // Initialize schema
  if (options.reset) {
    await resetDatabase(pg)
  }
  await initializeSchema(pg, options.customSchema)

  // Create managers
  const stateManager = new StateManager(pg)
  const memoryManager = new MemoryManager(pg)
  const executionManager = new ExecutionManager(pg)
  const queryHelpers = new QueryHelpers(pg)

  // VCSManager will be created lazily when execution starts
  let vcsManager: VCSManager | null = null
  const getVCSManager = (): VCSManager => {
    if (!vcsManager) {
      const executionId = (executionManager as any).currentExecutionId
      if (!executionId) {
        throw new Error('No active execution. Call db.execution.start() first.')
      }
      vcsManager = new VCSManager(pg, executionId)
    }
    return vcsManager
  }

  // VCS manager cache keyed by executionId
  const vcsManagers = new Map<string, VCSManager>()

  // Build the public API
  const db: SmithersDB = {
    pg,

    getVCSManager: (executionId: string) => {
      if (!vcsManagers.has(executionId)) {
        vcsManagers.set(executionId, new VCSManager(pg, executionId))
      }
      return vcsManagers.get(executionId)!
    },

    state: {
      get: <T>(key: string) => stateManager.get<T>(key),
      set: <T>(key: string, value: T, trigger?: string) =>
        stateManager.set(key, value, trigger),
      setMany: (updates: Record<string, any>, trigger?: string) =>
        stateManager.setMany(updates, trigger),
      getAll: () => stateManager.getAll(),
      reset: () => stateManager.reset(),
      history: (key?: string, limit?: number) =>
        key
          ? stateManager.getHistory(key, limit)
          : stateManager.getRecentTransitions(limit),
      replayTo: (transitionId: string) => stateManager.replayTo(transitionId),
      snapshot: () => stateManager.snapshot(),
      restore: (snapshot: Record<string, any>, trigger?: string) =>
        stateManager.restore(snapshot, trigger),
    },

    memories: {
      add: (memory: MemoryInput) => memoryManager.add(memory),
      get: (category: string, key: string, scope?: string) =>
        memoryManager.get(category, key, scope),
      list: (category?: string, scope?: string, limit?: number) =>
        memoryManager.list(category, scope, limit),
      search: (query: string, category?: string, limit?: number) =>
        memoryManager.search(query, category, limit),
      update: (id: string, updates: any) => memoryManager.update(id, updates),
      delete: (id: string) => memoryManager.delete(id),
      addFact: (key: string, content: string, source?: string) =>
        memoryManager.addFact(key, content, source),
      addLearning: (key: string, content: string, source?: string) =>
        memoryManager.addLearning(key, content, source),
      addPreference: (key: string, content: string, scope?: any) =>
        memoryManager.addPreference(key, content, scope),
      stats: () => memoryManager.getStats(),
    },

    execution: {
      start: (name: string, filePath: string, config?: Record<string, any>) =>
        executionManager.startExecution(name, filePath, config),
      complete: (id: string, result?: Record<string, any>) =>
        executionManager.completeExecution(id, result),
      fail: (id: string, error: string) => executionManager.failExecution(id, error),
      cancel: (id: string) => executionManager.cancelExecution(id),
      current: () => executionManager.getCurrentExecution(),
      get: (id: string) => executionManager.getExecution(id),
      list: (limit?: number) => executionManager.listExecutions(limit),
      findIncomplete: () => executionManager.findIncompleteExecution(),
    },

    phases: {
      start: (name: string, iteration?: number) =>
        executionManager.startPhase(name, iteration),
      complete: (id: string) => executionManager.completePhase(id),
      fail: (id: string) => executionManager.failPhase(id),
      current: () => executionManager.getCurrentPhase(),
      list: (executionId: string) => executionManager.getPhases(executionId),
    },

    agents: {
      start: (prompt: string, model?: string, systemPrompt?: string) =>
        executionManager.startAgent(prompt, model, systemPrompt),
      complete: (
        id: string,
        result: string,
        structuredResult?: Record<string, any>,
        tokens?: { input: number; output: number }
      ) => executionManager.completeAgent(id, result, structuredResult, tokens),
      fail: (id: string, error: string) => executionManager.failAgent(id, error),
      current: () => executionManager.getCurrentAgent(),
      list: (executionId: string) => executionManager.getAgents(executionId),
    },

    steps: {
      start: (_executionId: string, name?: string) => executionManager.startStep(name),
      complete: (id: string, vcsInfo?: any) => executionManager.completeStep(id, vcsInfo),
      fail: (id: string) => executionManager.failStep(id),
      current: () => executionManager.getCurrentStep(),
      list: (phaseId: string) => executionManager.getSteps(phaseId),
      getByExecution: (executionId: string) => executionManager.getStepsByExecution(executionId),
    },

    tools: {
      start: (agentId: string, toolName: string, input: Record<string, any>) =>
        executionManager.startToolCall(agentId, toolName, input),
      complete: (id: string, output: string, summary?: string) =>
        executionManager.completeToolCall(id, output, summary),
      fail: (id: string, error: string) => executionManager.failToolCall(id, error),
      list: (agentId: string) => executionManager.getToolCalls(agentId),
      getOutput: (id: string) => executionManager.getToolCallOutput(id),
    },

    artifacts: {
      add: (
        name: string,
        type: Artifact['type'],
        filePath: string,
        agentId?: string,
        metadata?: Record<string, any>
      ) => executionManager.addArtifact(name, type, filePath, agentId, metadata),
      list: (executionId: string) => executionManager.getArtifacts(executionId),
    },

    vcs: {
      logCommit: (commit) => getVCSManager().logCommit(commit),
      getCommits: (limit?) => getVCSManager().getCommits(limit),
      getCommit: (hash, vcsType?) => getVCSManager().getCommit(hash, vcsType),
      logSnapshot: (snapshot) => getVCSManager().logSnapshot(snapshot),
      getSnapshots: (limit?) => getVCSManager().getSnapshots(limit),
      logReview: (review) => getVCSManager().logReview(review),
      updateReview: (id, updates) => getVCSManager().updateReview(id, updates),
      getReviews: (limit?) => getVCSManager().getReviews(limit),
      getBlockingReviews: () => getVCSManager().getBlockingReviews(),
      addReport: (report) => getVCSManager().addReport(report),
      getReports: (type?, limit?) => getVCSManager().getReports(type, limit),
      getCriticalReports: () => getVCSManager().getCriticalReports(),
    },

    query: <T>(sql: string, params?: any[]) => queryHelpers.query<T>(sql, params),

    close: () => pg.close(),
  }

  return db
}

/**
 * Initialize database schema
 */
async function initializeSchema(pg: PGlite, customSchema?: string): Promise<void> {
  // Read schema SQL file
  const schemaPath = new URL('./schema.sql', import.meta.url).pathname
  const schemaSql = await fs.readFile(schemaPath, 'utf-8')

  // Execute schema
  await pg.exec(schemaSql)

  // Execute custom schema if provided
  if (customSchema) {
    await pg.exec(customSchema)
  }
}

/**
 * Reset database (drop all tables)
 */
async function resetDatabase(pg: PGlite): Promise<void> {
  await pg.exec(`
    DROP TABLE IF EXISTS steps CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS snapshots CASCADE;
    DROP TABLE IF EXISTS commits CASCADE;
    DROP TABLE IF EXISTS reports CASCADE;
    DROP TABLE IF EXISTS artifacts CASCADE;
    DROP TABLE IF EXISTS transitions CASCADE;
    DROP TABLE IF EXISTS state CASCADE;
    DROP TABLE IF EXISTS tool_calls CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS phases CASCADE;
    DROP TABLE IF EXISTS executions CASCADE;
    DROP TABLE IF EXISTS memories CASCADE;
  `)
}

// Re-export types
export * from './types.js'
