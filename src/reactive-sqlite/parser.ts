/**
 * Simple SQL parser for extracting table names
 *
 * This is a lightweight parser that extracts table names from common SQL patterns.
 * It doesn't need to be a full SQL parser - just enough to track dependencies.
 */

/**
 * Extract table names that are being READ from a SELECT query
 */
export function extractReadTables(sql: string): string[] {
  const tables = new Set<string>()
  const normalized = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase()

  // FROM clause: FROM table_name, FROM table_name AS alias
  const fromRegex = /\bfrom\s+([a-z_][a-z0-9_]*)/gi
  let match
  while ((match = fromRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // JOIN clauses: JOIN table_name, LEFT JOIN table_name, etc.
  const joinRegex = /\bjoin\s+([a-z_][a-z0-9_]*)/gi
  while ((match = joinRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // Subqueries in FROM (simplified - just look for nested FROM)
  // This is intentionally simple; complex subqueries will still work
  // because the outer FROM is captured

  return Array.from(tables)
}

/**
 * Extract table names that are being WRITTEN to (INSERT, UPDATE, DELETE)
 */
export function extractWriteTables(sql: string): string[] {
  const tables = new Set<string>()
  const normalized = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  // INSERT INTO table_name
  const insertRegex = /\binsert\s+(?:or\s+\w+\s+)?into\s+([a-z_][a-z0-9_]*)/gi
  let match
  while ((match = insertRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // UPDATE table_name
  const updateRegex = /\bupdate\s+(?:or\s+\w+\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = updateRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // DELETE FROM table_name
  const deleteRegex = /\bdelete\s+from\s+([a-z_][a-z0-9_]*)/gi
  while ((match = deleteRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // CREATE TABLE table_name
  const createRegex = /\bcreate\s+(?:temp\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = createRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // DROP TABLE table_name
  const dropRegex = /\bdrop\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = dropRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  // ALTER TABLE table_name
  const alterRegex = /\balter\s+table\s+([a-z_][a-z0-9_]*)/gi
  while ((match = alterRegex.exec(normalized)) !== null) {
    tables.add(match[1])
  }

  return Array.from(tables)
}

/**
 * Determine if a SQL statement is a read or write operation
 */
export function isWriteOperation(sql: string): boolean {
  const normalized = sql.trim().toLowerCase()
  return (
    normalized.startsWith('insert') ||
    normalized.startsWith('update') ||
    normalized.startsWith('delete') ||
    normalized.startsWith('create') ||
    normalized.startsWith('drop') ||
    normalized.startsWith('alter') ||
    normalized.startsWith('replace')
  )
}

/**
 * Extract all tables from a SQL statement (both read and write)
 */
export function extractAllTables(sql: string): { read: string[]; write: string[] } {
  return {
    read: extractReadTables(sql),
    write: extractWriteTables(sql),
  }
}

/**
 * Row filter result for fine-grained invalidation
 */
export interface RowFilter {
  table: string
  column: string
  value: string | number
}

/**
 * Extract row filter from simple WHERE clauses
 *
 * Only extracts filters from simple equality conditions like:
 * - WHERE id = ?
 * - WHERE id = 123
 * - WHERE user_id = ? AND ...
 *
 * Returns null for complex conditions (OR, IN, LIKE, subqueries, etc.)
 */
export function extractRowFilter(sql: string, params: unknown[] = []): RowFilter | null {
  const normalized = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // Don't process INSERT statements (no row filter possible)
  if (/^\s*insert/i.test(normalized)) {
    return null
  }

  // Check for OR conditions - these are too complex for simple row filtering
  if (/\bwhere\b.*\bor\b/i.test(normalized)) {
    return null
  }

  // Check for subqueries
  if (/\bwhere\b.*\b(in|exists)\s*\(/i.test(normalized)) {
    return null
  }

  // Check for LIKE conditions
  if (/\bwhere\b.*\blike\b/i.test(normalized)) {
    return null
  }

  // Check for range/comparison operators (>, <, >=, <=, <>)
  if (/\bwhere\b[^=]*[<>]/i.test(normalized)) {
    return null
  }

  // Extract table name from UPDATE, DELETE, or SELECT
  let table: string | null = null

  // UPDATE table SET ... WHERE
  const updateMatch = normalized.match(/\bupdate\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (updateMatch) {
    table = (updateMatch[1] || updateMatch[2]).toLowerCase()
  }

  // DELETE FROM table WHERE
  const deleteMatch = normalized.match(/\bdelete\s+from\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (deleteMatch) {
    table = (deleteMatch[1] || deleteMatch[2]).toLowerCase()
  }

  // SELECT ... FROM table WHERE
  const selectMatch = normalized.match(/\bfrom\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (selectMatch && !table) {
    table = (selectMatch[1] || selectMatch[2]).toLowerCase()
  }

  if (!table) {
    return null
  }

  // Extract WHERE clause
  const whereMatch = normalized.match(/\bwhere\s+(.+?)(?:\s+(?:order|group|limit|having)\b|$)/i)
  if (!whereMatch) {
    return null
  }

  const whereClause = whereMatch[1]

  // For AND conditions, take the first simple equality condition
  // Split by AND and take the first condition
  const conditions = whereClause.split(/\band\b/i)
  const firstCondition = conditions[0].trim()

  // Match simple equality: column = ? or column = value
  // Handle quoted identifiers
  const equalityMatch = firstCondition.match(
    /^(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*=\s*(.+)$/i
  )

  if (!equalityMatch) {
    return null
  }

  const column = (equalityMatch[1] || equalityMatch[2]).toLowerCase()
  const valueExpr = equalityMatch[3].trim()

  // Determine the value
  let value: string | number

  if (valueExpr === '?') {
    // Parameterized query - need to figure out which param
    // Count ? before the WHERE clause to find the right param index
    const beforeWhere = normalized.substring(0, normalized.toLowerCase().indexOf('where'))
    const paramsBefore = (beforeWhere.match(/\?/g) || []).length

    // For AND conditions, count ? in conditions before this one
    // (but for the first condition, it's just paramsBefore)
    const paramIndex = paramsBefore

    if (paramIndex >= params.length) {
      return null
    }

    value = params[paramIndex] as string | number
  } else {
    // Literal value - parse it
    // Try numeric
    const numMatch = valueExpr.match(/^(\d+)$/)
    if (numMatch) {
      value = parseInt(numMatch[1], 10)
    } else {
      // Try quoted string
      const strMatch = valueExpr.match(/^['"](.+)['"]$/)
      if (strMatch) {
        value = strMatch[1]
      } else {
        // Unquoted string or other literal
        value = valueExpr
      }
    }
  }

  return {
    table,
    column,
    value
  }
}
