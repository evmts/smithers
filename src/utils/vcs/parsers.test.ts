/**
 * Tests for parsers.ts - VCS output parsing utilities
 */

import { describe, test, expect } from 'bun:test'
import { parseGitStatus, parseJJStatus, parseDiffStats } from './parsers.js'

// Basic tests that mirror vcs.test.ts but for direct parser testing
describe('parseGitStatus - basic', () => {
  test('parses modified files', () => {
    const output = `M  src/file1.ts
 M src/file2.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toContain('src/file1.ts')
    expect(result.modified).toContain('src/file2.ts')
  })

  test('parses added files', () => {
    const output = `A  src/new-file.ts`
    const result = parseGitStatus(output)
    expect(result.added).toContain('src/new-file.ts')
  })

  test('parses deleted files', () => {
    const output = `D  src/removed.ts`
    const result = parseGitStatus(output)
    expect(result.deleted).toContain('src/removed.ts')
  })

  test('handles empty output', () => {
    const result = parseGitStatus('')
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })
})

describe('parseJJStatus - basic', () => {
  test('parses modified files', () => {
    const output = `M src/file1.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toContain('src/file1.ts')
  })

  test('parses added files', () => {
    const output = `A src/new-file.ts`
    const result = parseJJStatus(output)
    expect(result.added).toContain('src/new-file.ts')
  })

  test('parses deleted files', () => {
    const output = `D src/removed.ts`
    const result = parseJJStatus(output)
    expect(result.deleted).toContain('src/removed.ts')
  })

  test('handles empty output', () => {
    const result = parseJJStatus('')
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })
})

describe('parseDiffStats - basic', () => {
  test('parses file changes', () => {
    const output = ` src/file.ts | 10 +++++++---`
    const result = parseDiffStats(output)
    expect(result.files).toContain('src/file.ts')
    expect(result.insertions).toBe(7)
    expect(result.deletions).toBe(3)
  })

  test('handles empty output', () => {
    const result = parseDiffStats('')
    expect(result.files).toHaveLength(0)
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(0)
  })
})

// ============================================================================
// Missing Test TODOs
// ============================================================================

describe('parseGitStatus - edge cases', () => {
  test.todo('handles renamed files (R status)')
  test.todo('handles copied files (C status)')
  test.todo('handles unmerged files (U status)')
  test.todo('handles ignored files (!! status)')
  test.todo('handles untracked files (?? status)')
  test.todo('handles files with spaces in path')
  test.todo('handles files with quoted paths')
  test.todo('handles files with unicode characters')
  test.todo('handles files with newlines in name (escaped)')
  test.todo('handles status with both X and Y positions filled')
  test.todo('handles status line shorter than 3 characters')
  test.todo('handles status line with only status codes')
  test.todo('handles CRLF line endings')
  test.todo('handles mixed line endings')
  test.todo('handles very long file paths (>260 chars)')
})

describe('parseJJStatus - edge cases', () => {
  test.todo('handles renamed files')
  test.todo('handles copied files')
  test.todo('handles conflicted files')
  test.todo('handles files with spaces in path')
  test.todo('handles files with unicode characters')
  test.todo('handles files with leading/trailing whitespace')
  test.todo('handles status with extra whitespace')
  test.todo('handles unknown status codes')
  test.todo('handles CRLF line endings')
})

describe('parseDiffStats - edge cases', () => {
  test.todo('handles binary files (Bin X -> Y bytes)')
  test.todo('handles files with spaces in path')
  test.todo('handles files with unicode characters')
  test.todo('handles files with pipe character in name')
  test.todo('handles very large insertion counts (10000+)')
  test.todo('handles very large deletion counts (10000+)')
  test.todo('handles files with only insertions')
  test.todo('handles files with only deletions')
  test.todo('handles renamed files (old => new)')
  test.todo('handles mode changes (no +/- symbols)')
  test.todo('handles summary line (N files changed, X insertions)')
  test.todo('handles CRLF line endings')
  test.todo('handles different numstat vs stat format')
})
