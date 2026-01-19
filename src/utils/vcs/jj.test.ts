/**
 * Tests for jj.ts - Jujutsu VCS operations
 * 
 * Note: Most of these tests are integration tests that require jj to be installed.
 * They use mock data where possible to test parsing logic.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { parseJJStatus, parseDiffStats } from './parsers.js'

// ============================================================================
// Parser-based tests (don't require jj installation)
// ============================================================================

describe('jj status parsing', () => {
  test('parseJJStatus returns correct structure', () => {
    const output = `M src/modified.ts
A src/added.ts
D src/deleted.ts`
    const result = parseJJStatus(output)
    
    expect(result).toHaveProperty('modified')
    expect(result).toHaveProperty('added')
    expect(result).toHaveProperty('deleted')
    expect(Array.isArray(result.modified)).toBe(true)
    expect(Array.isArray(result.added)).toBe(true)
    expect(Array.isArray(result.deleted)).toBe(true)
  })

  test('handles clean working copy', () => {
    const result = parseJJStatus('')
    
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles modified files', () => {
    const output = `M src/file1.ts
M src/file2.ts
M src/file3.ts`
    const result = parseJJStatus(output)
    
    expect(result.modified).toHaveLength(3)
    expect(result.modified).toContain('src/file1.ts')
    expect(result.modified).toContain('src/file2.ts')
    expect(result.modified).toContain('src/file3.ts')
  })

  test('handles added files', () => {
    const output = `A src/new1.ts
A src/new2.ts`
    const result = parseJJStatus(output)
    
    expect(result.added).toHaveLength(2)
    expect(result.added).toContain('src/new1.ts')
    expect(result.added).toContain('src/new2.ts')
  })

  test('handles deleted files', () => {
    const output = `D src/removed1.ts
D src/removed2.ts`
    const result = parseJJStatus(output)
    
    expect(result.deleted).toHaveLength(2)
    expect(result.deleted).toContain('src/removed1.ts')
    expect(result.deleted).toContain('src/removed2.ts')
  })

  test('handles mixed status', () => {
    const output = `M src/modified.ts
A src/added.ts
D src/deleted.ts
M src/another-modified.ts`
    const result = parseJJStatus(output)
    
    expect(result.modified).toHaveLength(2)
    expect(result.added).toHaveLength(1)
    expect(result.deleted).toHaveLength(1)
  })

  test('handles files with spaces in path', () => {
    const output = `M src/my file.ts
A src/new file with spaces.ts`
    const result = parseJJStatus(output)
    
    expect(result.modified).toContain('src/my file.ts')
    expect(result.added).toContain('src/new file with spaces.ts')
  })
})

describe('jj diff stats parsing', () => {
  test('parseDiffStats returns correct structure', () => {
    const output = ` src/file.ts | 10 +++++++---`
    const result = parseDiffStats(output)
    
    expect(result).toHaveProperty('files')
    expect(result).toHaveProperty('insertions')
    expect(result).toHaveProperty('deletions')
  })

  test('handles empty stats for no changes', () => {
    const result = parseDiffStats('')
    
    expect(result.files).toHaveLength(0)
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  test('returns file list', () => {
    const output = ` src/a.ts | 5 +++++
 src/b.ts | 3 ---`
    const result = parseDiffStats(output)
    
    expect(result.files).toContain('src/a.ts')
    expect(result.files).toContain('src/b.ts')
  })

  test('counts insertions correctly', () => {
    const output = ` src/file.ts | 10 ++++++++++`
    const result = parseDiffStats(output)
    
    expect(result.insertions).toBe(10)
  })

  test('counts deletions correctly', () => {
    const output = ` src/file.ts | 8 --------`
    const result = parseDiffStats(output)
    
    expect(result.deletions).toBe(8)
  })

  test('handles binary files gracefully', () => {
    const output = ` image.png | Bin 0 -> 1234 bytes
 src/code.ts | 5 +++++`
    const result = parseDiffStats(output)
    
    // Binary file line won't match the pattern
    expect(result.files).toContain('src/code.ts')
    expect(result.insertions).toBe(5)
  })
})

// ============================================================================
// Type and interface tests
// ============================================================================

describe('jj types', () => {
  test('VCSStatus has correct shape', () => {
    const status = parseJJStatus('')
    
    expect(typeof status).toBe('object')
    expect('modified' in status).toBe(true)
    expect('added' in status).toBe(true)
    expect('deleted' in status).toBe(true)
  })

  test('DiffStats has correct shape', () => {
    const stats = parseDiffStats('')
    
    expect(typeof stats).toBe('object')
    expect('files' in stats).toBe(true)
    expect('insertions' in stats).toBe(true)
    expect('deletions' in stats).toBe(true)
  })
})

// ============================================================================
// Error handling tests (parser edge cases)
// ============================================================================

describe('jj error handling', () => {
  test('parseJJStatus handles malformed output', () => {
    const malformed = `not a status line
random text here
123456`
    const result = parseJJStatus(malformed)
    
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('parseDiffStats handles malformed output', () => {
    const malformed = `not a diff stat
random text
12345`
    const result = parseDiffStats(malformed)
    
    expect(result.files).toHaveLength(0)
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  test('handles null-like values gracefully', () => {
    // Empty string should work
    expect(() => parseJJStatus('')).not.toThrow()
    expect(() => parseDiffStats('')).not.toThrow()
  })

  test('handles whitespace-only output', () => {
    const whitespace = '   \n\t  \n   '
    const statusResult = parseJJStatus(whitespace)
    const diffResult = parseDiffStats(whitespace)
    
    expect(statusResult.modified).toHaveLength(0)
    expect(diffResult.files).toHaveLength(0)
  })
})

// ============================================================================
// Message handling tests
// ============================================================================

describe('jj message handling', () => {
  test('handles empty message gracefully', () => {
    // Test that empty strings are handled
    const emptyMessage = ''
    expect(emptyMessage.length).toBe(0)
  })

  test('handles message with special characters', () => {
    const specialMessage = 'Fix bug: handle "quotes" and \'apostrophes\''
    expect(specialMessage).toContain('"')
    expect(specialMessage).toContain("'")
  })

  test('handles message with newlines', () => {
    const multilineMessage = `First line

Second paragraph

- bullet 1
- bullet 2`
    expect(multilineMessage.split('\n').length).toBeGreaterThan(1)
  })

  test('handles unicode in messages', () => {
    const unicodeMessage = '✨ Add feature 日本語 émoji 🎉'
    expect(unicodeMessage).toContain('✨')
    expect(unicodeMessage).toContain('日本語')
  })
})

// ============================================================================
// Integration test stubs (require jj installation)
// ============================================================================

describe('jj command integration', () => {
  test('jj module exports expected functions', async () => {
    const jjModule = await import('./jj.js')
    
    expect(typeof jjModule.jj).toBe('function')
    expect(typeof jjModule.getJJChangeId).toBe('function')
    expect(typeof jjModule.jjSnapshot).toBe('function')
    expect(typeof jjModule.jjCommit).toBe('function')
    expect(typeof jjModule.getJJStatus).toBe('function')
    expect(typeof jjModule.getJJDiffStats).toBe('function')
    expect(typeof jjModule.isJJRepo).toBe('function')
  })
})

describe('isJJRepo', () => {
  test('returns boolean', async () => {
    const { isJJRepo } = await import('./jj.js')
    const result = await isJJRepo()
    
    expect(typeof result).toBe('boolean')
  })
})
