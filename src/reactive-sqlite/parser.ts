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
