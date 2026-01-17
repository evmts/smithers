// Memory operations - long-term agent knowledge

import type { PGlite } from '@electric-sql/pglite'
import { QueryHelpers } from './live-query.js'
import type { Memory, MemoryInput } from './types.js'

export class MemoryManager {
  private queries: QueryHelpers
  private currentExecutionId: string | null = null

  constructor(private pg: PGlite) {
    this.queries = new QueryHelpers(pg)
  }

  /**
   * Set the current execution ID for source tracking
   */
  setExecutionContext(executionId: string | null) {
    this.currentExecutionId = executionId
  }

  /**
   * Add a new memory
   */
  async add(input: MemoryInput): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO memories (
        category,
        scope,
        key,
        content,
        confidence,
        source,
        source_execution_id,
        created_at,
        updated_at,
        accessed_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW(), $8)
      ON CONFLICT (category, scope, key) DO UPDATE
      SET
        content = $4,
        confidence = $5,
        source = $6,
        updated_at = NOW()
      RETURNING id`,
      [
        input.category,
        input.scope || 'global',
        input.key,
        input.content,
        input.confidence ?? 1.0,
        input.source,
        this.currentExecutionId,
        input.expires_at,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Get a specific memory
   */
  async get(category: string, key: string, scope: string = 'global'): Promise<Memory | null> {
    const memory = await this.queries.queryOne<Memory>(
      `SELECT * FROM memories
       WHERE category = $1 AND key = $2 AND scope = $3`,
      [category, key, scope]
    )

    if (memory) {
      // Update accessed_at
      await this.pg.query(
        `UPDATE memories SET accessed_at = NOW() WHERE id = $1`,
        [memory.id]
      )
    }

    return memory
  }

  /**
   * List memories by category and/or scope
   */
  async list(
    category?: string,
    scope?: string,
    limit: number = 100
  ): Promise<Memory[]> {
    let sql = 'SELECT * FROM memories WHERE 1=1'
    const params: any[] = []

    if (category) {
      params.push(category)
      sql += ` AND category = $${params.length}`
    }

    if (scope) {
      params.push(scope)
      sql += ` AND scope = $${params.length}`
    }

    // Exclude expired memories
    sql += ' AND (expires_at IS NULL OR expires_at > NOW())'

    sql += ` ORDER BY accessed_at DESC LIMIT $${params.length + 1}`
    params.push(limit)

    return this.queries.query<Memory>(sql, params)
  }

  /**
   * Search memories by content (simple text search)
   * For more advanced search, consider adding pgvector embeddings
   */
  async search(
    query: string,
    category?: string,
    limit: number = 10
  ): Promise<Memory[]> {
    let sql = `
      SELECT *,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
      FROM memories
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
    `
    const params: any[] = [query]

    if (category) {
      params.push(category)
      sql += ` AND category = $${params.length}`
    }

    // Exclude expired
    sql += ' AND (expires_at IS NULL OR expires_at > NOW())'

    sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`
    params.push(limit)

    return this.queries.query<Memory>(sql, params)
  }

  /**
   * Update a memory's content
   */
  async update(
    id: string,
    updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>
  ): Promise<void> {
    const sets: string[] = ['updated_at = NOW()']
    const params: any[] = []

    if (updates.content !== undefined) {
      params.push(updates.content)
      sets.push(`content = $${params.length}`)
    }

    if (updates.confidence !== undefined) {
      params.push(updates.confidence)
      sets.push(`confidence = $${params.length}`)
    }

    if (updates.expires_at !== undefined) {
      params.push(updates.expires_at)
      sets.push(`expires_at = $${params.length}`)
    }

    params.push(id)

    await this.pg.query(
      `UPDATE memories SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<void> {
    await this.pg.query('DELETE FROM memories WHERE id = $1', [id])
  }

  /**
   * Delete memories by category/key
   */
  async deleteByKey(category: string, key: string, scope: string = 'global'): Promise<void> {
    await this.pg.query(
      'DELETE FROM memories WHERE category = $1 AND key = $2 AND scope = $3',
      [category, key, scope]
    )
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.pg.query(
      'DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    )
    return result.affectedRows ?? 0
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    total: number
    byCategory: Record<string, number>
    byScope: Record<string, number>
  }> {
    const [totalResult, categoryResult, scopeResult] = await Promise.all([
      this.queries.queryValue<number>('SELECT COUNT(*) as value FROM memories'),
      this.queries.query<{ category: string; count: number }>(
        'SELECT category, COUNT(*) as count FROM memories GROUP BY category'
      ),
      this.queries.query<{ scope: string; count: number }>(
        'SELECT scope, COUNT(*) as count FROM memories GROUP BY scope'
      ),
    ])

    return {
      total: totalResult ?? 0,
      byCategory: Object.fromEntries(
        categoryResult.map((r) => [r.category, r.count])
      ),
      byScope: Object.fromEntries(
        scopeResult.map((r) => [r.scope, r.count])
      ),
    }
  }

  /**
   * Create a fact memory (convenience method)
   */
  async addFact(key: string, content: string, source?: string): Promise<string> {
    return this.add({
      category: 'fact',
      key,
      content,
      source,
    })
  }

  /**
   * Create a learning memory (convenience method)
   */
  async addLearning(key: string, content: string, source?: string): Promise<string> {
    return this.add({
      category: 'learning',
      key,
      content,
      source,
    })
  }

  /**
   * Create a preference memory (convenience method)
   */
  async addPreference(
    key: string,
    content: string,
    scope: 'global' | 'project' | 'session' = 'project'
  ): Promise<string> {
    return this.add({
      category: 'preference',
      key,
      content,
      scope,
    })
  }
}
