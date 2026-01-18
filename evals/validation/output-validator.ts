/**
 * Output validation utilities for eval tests.
 * Provides structured validation of XML output and database state.
 */

import type { SmithersDB } from '../../src/db/index.js'

export interface EvalResult {
  test: string
  passed: boolean
  duration_ms: number
  structured_output: Record<string, any>
  errors: string[]
}

export interface XMLValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface DBValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate XML structure and content
 */
export function validateXML(xml: string): XMLValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Basic structure checks
  if (!xml || xml.trim() === '') {
    errors.push('XML is empty')
  }

  // Check for balanced tags (simple validation)
  const openTags = (xml.match(/<[^/][^>]*>/g) || []).length
  const closeTags = (xml.match(/<\/[^>]+>/g) || []).length
  const selfClosingTags = (xml.match(/<[^>]*\/>/g) || []).length

  if (openTags !== closeTags + selfClosingTags) {
    errors.push(`Unbalanced tags: ${openTags} open, ${closeTags} close, ${selfClosingTags} self-closing`)
  }

  // Check for double-escaping (common bug)
  if (xml.includes('&amp;amp;') || xml.includes('&amp;lt;') || xml.includes('&amp;gt;')) {
    errors.push('Double-escaped entities detected')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Check if XML contains a specific pattern (xpath-like)
 */
export function assertXMLContains(xml: string, pattern: string): boolean {
  return xml.includes(pattern)
}

/**
 * Count occurrences of a pattern in XML
 */
export function countXMLOccurrences(xml: string, pattern: string): number {
  const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
  return (xml.match(regex) || []).length
}

/**
 * Validate database state consistency
 */
export function validateDatabase(db: SmithersDB): DBValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    // Check if execution exists
    const execution = db.query('SELECT * FROM executions LIMIT 1', [])
    if (!execution || execution.length === 0) {
      errors.push('No execution record found')
    }

    // Check for orphaned records (phases without execution)
    const orphanedPhases = db.query(
      'SELECT COUNT(*) as count FROM phases WHERE execution_id NOT IN (SELECT execution_id FROM executions)',
      []
    )
    if (orphanedPhases && orphanedPhases[0]?.count > 0) {
      errors.push(`Found ${orphanedPhases[0].count} orphaned phase records`)
    }

    // Check timestamp consistency (no future timestamps)
    const futureTimestamps = db.query(
      'SELECT COUNT(*) as count FROM phases WHERE created_at > ?',
      [new Date(Date.now() + 1000).toISOString()]
    )
    if (futureTimestamps && futureTimestamps[0]?.count > 0) {
      warnings.push(`Found ${futureTimestamps[0].count} records with future timestamps`)
    }
  } catch (error) {
    errors.push(`Database validation error: ${error}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate eval result structure
 */
export function validateEvalResult(result: EvalResult): boolean {
  if (!result.test || typeof result.test !== 'string') return false
  if (typeof result.passed !== 'boolean') return false
  if (typeof result.duration_ms !== 'number') return false
  if (!Array.isArray(result.errors)) return false

  return true
}

/**
 * Create a standard eval result object
 */
export function createEvalResult(
  test: string,
  passed: boolean,
  structuredOutput: Record<string, any> = {},
  errors: string[] = []
): EvalResult {
  return {
    test,
    passed,
    duration_ms: 0, // Will be set by test runner
    structured_output: structuredOutput,
    errors,
  }
}
