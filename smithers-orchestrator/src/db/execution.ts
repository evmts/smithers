// Execution tracking - orchestration runs, phases, agents, tool calls

import type { PGlite } from '@electric-sql/pglite'
import { QueryHelpers } from './live-query.js'
import type { Execution, Phase, Agent, ToolCall, Artifact, Step } from './types.js'
import * as fs from 'fs/promises'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCallback)

const OUTPUT_INLINE_THRESHOLD = 1024 // 1KB

export class ExecutionManager {
  private queries: QueryHelpers
  private currentExecutionId: string | null = null
  private currentPhaseId: string | null = null
  private currentAgentId: string | null = null
  private currentStepId: string | null = null

  constructor(private pg: PGlite) {
    this.queries = new QueryHelpers(pg)
  }

  // ============================================================================
  // EXECUTIONS
  // ============================================================================

  /**
   * Start a new execution
   */
  async startExecution(
    name: string,
    filePath: string,
    config: Record<string, any> = {}
  ): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO executions (
        name,
        file_path,
        status,
        config,
        started_at,
        created_at
      ) VALUES ($1, $2, 'running', $3, NOW(), NOW())
      RETURNING id`,
      [name, filePath, JSON.stringify(config)]
    )

    this.currentExecutionId = result.rows[0].id
    return this.currentExecutionId
  }

  /**
   * Complete an execution
   */
  async completeExecution(
    id: string,
    result?: Record<string, any>
  ): Promise<void> {
    await this.pg.query(
      `UPDATE executions
       SET status = 'completed',
           result = $2,
           completed_at = NOW()
       WHERE id = $1`,
      [id, result ? JSON.stringify(result) : null]
    )
  }

  /**
   * Mark execution as failed
   */
  async failExecution(id: string, error: string): Promise<void> {
    await this.pg.query(
      `UPDATE executions
       SET status = 'failed',
           error = $2,
           completed_at = NOW()
       WHERE id = $1`,
      [id, error]
    )
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(id: string): Promise<void> {
    await this.pg.query(
      `UPDATE executions
       SET status = 'cancelled',
           completed_at = NOW()
       WHERE id = $1`,
      [id]
    )
  }

  /**
   * Get current execution
   */
  async getCurrentExecution(): Promise<Execution | null> {
    if (!this.currentExecutionId) return null
    return this.getExecution(this.currentExecutionId)
  }

  /**
   * Get execution by ID
   */
  async getExecution(id: string): Promise<Execution | null> {
    return this.queries.queryOne<Execution>(
      'SELECT * FROM executions WHERE id = $1',
      [id]
    )
  }

  /**
   * List recent executions
   */
  async listExecutions(limit: number = 100): Promise<Execution[]> {
    return this.queries.query<Execution>(
      'SELECT * FROM executions ORDER BY created_at DESC LIMIT $1',
      [limit]
    )
  }

  /**
   * Find incomplete execution (for crash recovery)
   */
  async findIncompleteExecution(): Promise<Execution | null> {
    return this.queries.queryOne<Execution>(
      `SELECT * FROM executions
       WHERE status = 'running'
       AND completed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    )
  }

  /**
   * Update execution metrics
   */
  async updateExecutionMetrics(
    id: string,
    updates: Partial<Pick<Execution, 'total_iterations' | 'total_agents' | 'total_tool_calls' | 'total_tokens_used'>>
  ): Promise<void> {
    const sets: string[] = []
    const params: any[] = []

    if (updates.total_iterations !== undefined) {
      params.push(updates.total_iterations)
      sets.push(`total_iterations = $${params.length}`)
    }

    if (updates.total_agents !== undefined) {
      params.push(updates.total_agents)
      sets.push(`total_agents = $${params.length}`)
    }

    if (updates.total_tool_calls !== undefined) {
      params.push(updates.total_tool_calls)
      sets.push(`total_tool_calls = $${params.length}`)
    }

    if (updates.total_tokens_used !== undefined) {
      params.push(updates.total_tokens_used)
      sets.push(`total_tokens_used = $${params.length}`)
    }

    if (sets.length === 0) return

    params.push(id)
    await this.pg.query(
      `UPDATE executions SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  // ============================================================================
  // PHASES
  // ============================================================================

  /**
   * Start a new phase
   */
  async startPhase(name: string, iteration: number = 0): Promise<string> {
    if (!this.currentExecutionId) {
      throw new Error('No active execution')
    }

    const result = await this.pg.query(
      `INSERT INTO phases (
        execution_id,
        name,
        iteration,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, 'running', NOW(), NOW())
      RETURNING id`,
      [this.currentExecutionId, name, iteration]
    )

    this.currentPhaseId = result.rows[0].id
    return this.currentPhaseId
  }

  /**
   * Complete a phase
   */
  async completePhase(id: string): Promise<void> {
    await this.pg.query(
      `UPDATE phases
       SET status = 'completed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`,
      [id]
    )
  }

  /**
   * Mark phase as failed
   */
  async failPhase(id: string): Promise<void> {
    await this.pg.query(
      `UPDATE phases
       SET status = 'failed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`,
      [id]
    )
  }

  /**
   * Get current phase
   */
  async getCurrentPhase(): Promise<Phase | null> {
    if (!this.currentPhaseId) return null
    return this.queries.queryOne<Phase>(
      'SELECT * FROM phases WHERE id = $1',
      [this.currentPhaseId]
    )
  }

  /**
   * Get phases for execution
   */
  async getPhases(executionId: string): Promise<Phase[]> {
    return this.queries.query<Phase>(
      'SELECT * FROM phases WHERE execution_id = $1 ORDER BY created_at',
      [executionId]
    )
  }

  // ============================================================================
  // AGENTS
  // ============================================================================

  /**
   * Start a new agent execution
   */
  async startAgent(
    prompt: string,
    model: string = 'sonnet',
    systemPrompt?: string
  ): Promise<string> {
    if (!this.currentExecutionId) {
      throw new Error('No active execution')
    }

    const result = await this.pg.query(
      `INSERT INTO agents (
        execution_id,
        phase_id,
        model,
        system_prompt,
        prompt,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'running', NOW(), NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        this.currentPhaseId,
        model,
        systemPrompt,
        prompt,
      ]
    )

    this.currentAgentId = result.rows[0].id

    // Update execution agent count
    await this.pg.query(
      'UPDATE executions SET total_agents = total_agents + 1 WHERE id = $1',
      [this.currentExecutionId]
    )

    return this.currentAgentId
  }

  /**
   * Complete an agent execution
   */
  async completeAgent(
    id: string,
    result: string,
    structuredResult?: Record<string, any>,
    tokens?: { input: number; output: number }
  ): Promise<void> {
    await this.pg.query(
      `UPDATE agents
       SET status = 'completed',
           result = $2,
           result_structured = $3,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           tokens_input = $4,
           tokens_output = $5
       WHERE id = $1`,
      [
        id,
        result,
        structuredResult ? JSON.stringify(structuredResult) : null,
        tokens?.input,
        tokens?.output,
      ]
    )

    // Update execution token count
    if (tokens) {
      await this.pg.query(
        'UPDATE executions SET total_tokens_used = total_tokens_used + $2 WHERE id = $1',
        [this.currentExecutionId, tokens.input + tokens.output]
      )
    }
  }

  /**
   * Mark agent as failed
   */
  async failAgent(id: string, error: string): Promise<void> {
    await this.pg.query(
      `UPDATE agents
       SET status = 'failed',
           error = $2,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`,
      [id, error]
    )
  }

  /**
   * Get current agent
   */
  async getCurrentAgent(): Promise<Agent | null> {
    if (!this.currentAgentId) return null
    return this.queries.queryOne<Agent>(
      'SELECT * FROM agents WHERE id = $1',
      [this.currentAgentId]
    )
  }

  /**
   * Get agents for execution
   */
  async getAgents(executionId: string): Promise<Agent[]> {
    return this.queries.query<Agent>(
      'SELECT * FROM agents WHERE execution_id = $1 ORDER BY created_at',
      [executionId]
    )
  }

  // ============================================================================
  // TOOL CALLS
  // ============================================================================

  /**
   * Log a tool call start
   */
  async startToolCall(
    agentId: string,
    toolName: string,
    input: Record<string, any>
  ): Promise<string> {
    if (!this.currentExecutionId) {
      throw new Error('No active execution')
    }

    const result = await this.pg.query(
      `INSERT INTO tool_calls (
        agent_id,
        execution_id,
        tool_name,
        input,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, $4, 'running', NOW(), NOW())
      RETURNING id`,
      [agentId, this.currentExecutionId, toolName, JSON.stringify(input)]
    )

    // Update counts
    await Promise.all([
      this.pg.query(
        'UPDATE agents SET tool_calls_count = tool_calls_count + 1 WHERE id = $1',
        [agentId]
      ),
      this.pg.query(
        'UPDATE executions SET total_tool_calls = total_tool_calls + 1 WHERE id = $1',
        [this.currentExecutionId]
      ),
    ])

    return result.rows[0].id
  }

  /**
   * Complete a tool call with output
   * Automatically handles inline vs git-referenced storage
   */
  async completeToolCall(
    id: string,
    output: string,
    summary?: string
  ): Promise<void> {
    const outputSize = Buffer.byteLength(output, 'utf8')

    if (outputSize <= OUTPUT_INLINE_THRESHOLD) {
      // Small output: store inline
      await this.pg.query(
        `UPDATE tool_calls
         SET status = 'completed',
             output_inline = $2,
             output_size_bytes = $3,
             completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE id = $1`,
        [id, output, outputSize]
      )
    } else {
      // Large output: write to file and get git hash
      const outputPath = `.smithers/logs/tool-${id}.txt`
      await fs.writeFile(outputPath, output, 'utf-8')

      // Get git hash (if git is available)
      let gitHash: string | null = null
      try {
        const { stdout } = await exec(`git hash-object "${outputPath}"`)
        gitHash = stdout.trim()
      } catch {
        // Git not available or not in a repo
      }

      await this.pg.query(
        `UPDATE tool_calls
         SET status = 'completed',
             output_path = $2,
             output_git_hash = $3,
             output_summary = $4,
             output_size_bytes = $5,
             completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE id = $1`,
        [id, outputPath, gitHash, summary, outputSize]
      )
    }
  }

  /**
   * Mark tool call as failed
   */
  async failToolCall(id: string, error: string): Promise<void> {
    await this.pg.query(
      `UPDATE tool_calls
       SET status = 'failed',
           error = $2,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`,
      [id, error]
    )
  }

  /**
   * Get tool calls for agent
   */
  async getToolCalls(agentId: string): Promise<ToolCall[]> {
    return this.queries.query<ToolCall>(
      'SELECT * FROM tool_calls WHERE agent_id = $1 ORDER BY created_at',
      [agentId]
    )
  }

  /**
   * Get tool call output (handles both inline and file-based)
   */
  async getToolCallOutput(id: string): Promise<string | null> {
    const toolCall = await this.queries.queryOne<ToolCall>(
      'SELECT * FROM tool_calls WHERE id = $1',
      [id]
    )

    if (!toolCall) return null

    if (toolCall.output_inline) {
      return toolCall.output_inline
    }

    if (toolCall.output_path) {
      try {
        return await fs.readFile(toolCall.output_path, 'utf-8')
      } catch {
        return null
      }
    }

    return null
  }

  // ============================================================================
  // ARTIFACTS
  // ============================================================================

  /**
   * Add an artifact (file/code reference)
   */
  async addArtifact(
    name: string,
    type: Artifact['type'],
    filePath: string,
    agentId?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.currentExecutionId) {
      throw new Error('No active execution')
    }

    // Get git hash if file exists
    let gitHash: string | null = null
    let gitCommit: string | null = null
    let lineCount: number | null = null
    let byteSize: number | null = null

    try {
      const { stdout: hashOut } = await exec(`git hash-object "${filePath}"`)
      gitHash = hashOut.trim()

      const { stdout: commitOut } = await exec(`git log -1 --format=%H -- "${filePath}"`)
      gitCommit = commitOut.trim() || null

      const stats = await fs.stat(filePath)
      byteSize = stats.size

      if (type === 'code' || type === 'file') {
        const content = await fs.readFile(filePath, 'utf-8')
        lineCount = content.split('\n').length
      }
    } catch {
      // File doesn't exist yet or git not available
    }

    const result = await this.pg.query(
      `INSERT INTO artifacts (
        execution_id,
        agent_id,
        name,
        type,
        file_path,
        git_hash,
        git_commit,
        line_count,
        byte_size,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        agentId || this.currentAgentId,
        name,
        type,
        filePath,
        gitHash,
        gitCommit,
        lineCount,
        byteSize,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Get artifacts for execution
   */
  async getArtifacts(executionId: string): Promise<Artifact[]> {
    return this.queries.query<Artifact>(
      'SELECT * FROM artifacts WHERE execution_id = $1 ORDER BY created_at',
      [executionId]
    )
  }

  // ============================================================================
  // STEPS
  // ============================================================================

  /**
   * Start a new step
   */
  async startStep(name?: string): Promise<string> {
    if (!this.currentExecutionId) {
      throw new Error('No active execution')
    }

    const result = await this.pg.query(
      `INSERT INTO steps (
        execution_id,
        phase_id,
        name,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, 'running', NOW(), NOW())
      RETURNING id`,
      [this.currentExecutionId, this.currentPhaseId, name]
    )

    this.currentStepId = result.rows[0].id
    return this.currentStepId
  }

  /**
   * Complete a step
   */
  async completeStep(
    id: string,
    vcsInfo?: {
      snapshot_before?: string
      snapshot_after?: string
      commit_created?: string
    }
  ): Promise<void> {
    await this.pg.query(
      `UPDATE steps
       SET status = 'completed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           snapshot_before = $2,
           snapshot_after = $3,
           commit_created = $4
       WHERE id = $1`,
      [
        id,
        vcsInfo?.snapshot_before ?? null,
        vcsInfo?.snapshot_after ?? null,
        vcsInfo?.commit_created ?? null,
      ]
    )
  }

  /**
   * Mark step as failed
   */
  async failStep(id: string): Promise<void> {
    await this.pg.query(
      `UPDATE steps
       SET status = 'failed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`,
      [id]
    )
  }

  /**
   * Get current step
   */
  async getCurrentStep(): Promise<Step | null> {
    if (!this.currentStepId) return null
    return this.queries.queryOne<Step>(
      'SELECT * FROM steps WHERE id = $1',
      [this.currentStepId]
    )
  }

  /**
   * Get steps for phase
   */
  async getSteps(phaseId: string): Promise<Step[]> {
    return this.queries.query<Step>(
      'SELECT * FROM steps WHERE phase_id = $1 ORDER BY created_at',
      [phaseId]
    )
  }

  /**
   * Get steps for execution
   */
  async getStepsByExecution(executionId: string): Promise<Step[]> {
    return this.queries.query<Step>(
      'SELECT * FROM steps WHERE execution_id = $1 ORDER BY created_at',
      [executionId]
    )
  }
}
