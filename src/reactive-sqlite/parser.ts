/**
 * Simple SQL parser for extracting table names
 *
 * This is a lightweight parser that extracts table names from common SQL patterns.
 * It doesn't need to be a full SQL parser - just enough to track dependencies.
 */

const IDENTIFIER_PATTERN = '"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|[a-z_][a-z0-9_]*'
const QUALIFIER_PATTERN = `(?:${IDENTIFIER_PATTERN})\\s*\\.\\s*`
const TABLE_NAME_PATTERN =
  `(?:${QUALIFIER_PATTERN})?(?:"([^"]+)"|` +
  '`([^`]+)`' +
  `|\\[([^\\]]+)\\]|([a-z_][a-z0-9_]*))`
const COLUMN_NAME_PATTERN =
  `(?:${QUALIFIER_PATTERN})?(?:"([^"]+)"|` +
  '`([^`]+)`' +
  `|\\[([^\\]]+)\\]|([a-z_][a-z0-9_]*))`

function extractIdentifier(match: RegExpMatchArray): string | null {
  const identifier = match[1] || match[2] || match[3] || match[4]
  return identifier ? identifier.toLowerCase() : null
}

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

  // FROM clause: FROM table_name, FROM schema.table_name, quoted identifiers
  const fromRegex = new RegExp(`\\bfrom\\s+${TABLE_NAME_PATTERN}`, 'gi')
  let match
  while ((match = fromRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // JOIN clauses: JOIN table_name, LEFT JOIN table_name, etc.
  const joinRegex = new RegExp(`\\bjoin\\s+${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = joinRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
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
  const insertRegex = new RegExp(`\\binsert\\s+(?:or\\s+\\w+\\s+)?into\\s+${TABLE_NAME_PATTERN}`, 'gi')
  let match
  while ((match = insertRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // UPDATE table_name
  const updateRegex = new RegExp(`\\bupdate\\s+(?:or\\s+\\w+\\s+)?${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = updateRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // DELETE FROM table_name
  const deleteRegex = new RegExp(`\\bdelete\\s+from\\s+${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = deleteRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // REPLACE INTO table_name (standalone, not INSERT OR REPLACE which is handled by insertRegex)
  const replaceRegex = new RegExp(`\\breplace\\s+into\\s+${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = replaceRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // CREATE TABLE table_name
  const createRegex = new RegExp(
    `\\bcreate\\s+(?:temp\\s+|temporary\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${TABLE_NAME_PATTERN}`,
    'gi'
  )
  while ((match = createRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // DROP TABLE table_name
  const dropRegex = new RegExp(`\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = dropRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
  }

  // ALTER TABLE table_name
  const alterRegex = new RegExp(`\\balter\\s+table\\s+${TABLE_NAME_PATTERN}`, 'gi')
  while ((match = alterRegex.exec(normalized)) !== null) {
    const table = extractIdentifier(match)
    if (table) {
      tables.add(table)
    }
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

import type { RowFilter } from "./types.js"

/**
 * Extract row filter from simple WHERE clauses
 *
 * Only extracts filters from simple equality conditions on id/rowid like:
 * - WHERE id = ?
 * - WHERE rowid = 123
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
  const updateMatch = normalized.match(
    new RegExp(`\\bupdate\\s+(?:or\\s+\\w+\\s+)?${TABLE_NAME_PATTERN}`, 'i')
  )
  if (updateMatch) {
    table = extractIdentifier(updateMatch)
  }

  // DELETE FROM table WHERE
  const deleteMatch = normalized.match(new RegExp(`\\bdelete\\s+from\\s+${TABLE_NAME_PATTERN}`, 'i'))
  if (deleteMatch) {
    table = extractIdentifier(deleteMatch)
  }

  // SELECT ... FROM table WHERE
  const selectMatch = normalized.match(new RegExp(`\\bfrom\\s+${TABLE_NAME_PATTERN}`, 'i'))
  if (selectMatch && !table) {
    table = extractIdentifier(selectMatch)
  }

  if (!table) {
    return null
  }

  // Extract WHERE clause
  const whereMatch = normalized.match(/\bwhere\s+(.+?)(?:\s+(?:order|group|limit|having)\b|$)/i)
  if (!whereMatch || !whereMatch[1]) {
    return null
  }

  const whereClause = whereMatch[1]

  const conditions = whereClause.split(/\band\b/i).map((condition) => condition.trim()).filter(Boolean)
  if (conditions.length === 0) {
    return null
  }

  // Count ? before the WHERE clause to find the right param index base
  const beforeWhere = normalized.substring(0, normalized.toLowerCase().indexOf('where'))
  const paramsBefore = (beforeWhere.match(/\?/g) || []).length
  let paramsOffset = 0

  let selected: RowFilter | null = null
  let selectedRank = -1

  for (const condition of conditions) {
    const conditionParamCount = (condition.match(/\?/g) || []).length

    // Match simple equality: column = ? or column = value (optionally table-prefixed)
    const equalityMatch = condition.match(
      new RegExp(`^${COLUMN_NAME_PATTERN}\\s*=\\s*(.+)$`, 'i')
    )

    if (!equalityMatch || !equalityMatch[5]) {
      paramsOffset += conditionParamCount
      continue
    }

    const column = (extractIdentifier(equalityMatch) || '').toLowerCase()
    if (column !== 'id' && column !== 'rowid') {
      paramsOffset += conditionParamCount
      continue
    }

    const valueExpr = equalityMatch[5].trim()
    let value: string | number | null = null

    if (valueExpr === '?') {
      const paramIndex = paramsBefore + paramsOffset
      if (paramIndex >= params.length) {
        paramsOffset += conditionParamCount
        continue
      }
      const paramValue = params[paramIndex]
      if (typeof paramValue === 'string' || typeof paramValue === 'number') {
        value = paramValue
      }
    } else {
      const numMatch = valueExpr.match(/^(\d+)$/)
      if (numMatch && numMatch[1]) {
        value = parseInt(numMatch[1], 10)
      } else {
        const strMatch = valueExpr.match(/^['"](.+)['"]$/)
        if (strMatch && strMatch[1]) {
          value = strMatch[1]
        } else {
          value = valueExpr
        }
      }
    }

    if (value !== null) {
      const rank = column === 'id' ? 2 : 1
      if (rank > selectedRank) {
        selected = { table, column, value }
        selectedRank = rank
      }
    }

    paramsOffset += conditionParamCount
  }

  return selected
}
