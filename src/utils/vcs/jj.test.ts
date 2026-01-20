/**
 * Tests for jj.ts - Jujutsu VCS operations
 * 
 * Note: Most of these tests are integration tests that require jj to be installed.
 * They use mock data where possible to test parsing logic.
 */

import { describe, test, expect } from 'bun:test'
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
// JJ Status with special commit messages (parsing tests)
// ============================================================================

describe('jj status with special content', () => {
  test('parses files with paths containing commit-like strings', () => {
    const output = `M src/abc1234.ts
A src/commit-message.ts`
    const result = parseJJStatus(output)
    
    expect(result.modified).toEqual(['src/abc1234.ts'])
    expect(result.added).toEqual(['src/commit-message.ts'])
  })

  test('parses files with deeply nested paths', () => {
    const output = `M src/components/ui/buttons/primary/styles.ts
A test/integration/e2e/auth/login.test.ts
D old/legacy/deprecated/removed.ts`
    const result = parseJJStatus(output)
    
    expect(result.modified).toEqual(['src/components/ui/buttons/primary/styles.ts'])
    expect(result.added).toEqual(['test/integration/e2e/auth/login.test.ts'])
    expect(result.deleted).toEqual(['old/legacy/deprecated/removed.ts'])
  })

  test('parses files with dots in names', () => {
    const output = `M src/file.test.spec.ts
A config.env.local.json`
    const result = parseJJStatus(output)
    
    expect(result.modified).toEqual(['src/file.test.spec.ts'])
    expect(result.added).toEqual(['config.env.local.json'])
  })

  test('parses files with numeric names', () => {
    const output = `M 123.ts
A 456789.json`
    const result = parseJJStatus(output)
    
    expect(result.modified).toEqual(['123.ts'])
    expect(result.added).toEqual(['456789.json'])
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

// ============================================================================
// getSnapshot tests (out-of-loop JJ state access)
// ============================================================================

describe('getSnapshot', () => {
  test('returns null when no snapshot has been fetched', async () => {
    const { getSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    const result = getSnapshot()
    expect(result).toBeNull()
  })

  test('returns cached snapshot after refreshSnapshot', async () => {
    const { getSnapshot, refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    const snapshot = await refreshSnapshot()
    const cached = getSnapshot()
    
    expect(cached).not.toBeNull()
    expect(cached?.timestamp).toBe(snapshot.timestamp)
    expect(cached?.isJJRepo).toBe(snapshot.isJJRepo)
  })

  test('clearSnapshotCache resets the cache', async () => {
    const { getSnapshot, refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    
    await refreshSnapshot()
    expect(getSnapshot()).not.toBeNull()
    
    clearSnapshotCache()
    expect(getSnapshot()).toBeNull()
  })

  test('JJStateSnapshot has correct shape', async () => {
    const { refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    const snapshot = await refreshSnapshot()
    
    expect(typeof snapshot.changeId).toBe('string')
    expect(typeof snapshot.description).toBe('string')
    expect(typeof snapshot.isJJRepo).toBe('boolean')
    expect(typeof snapshot.timestamp).toBe('number')
    expect(snapshot.status).toHaveProperty('modified')
    expect(snapshot.status).toHaveProperty('added')
    expect(snapshot.status).toHaveProperty('deleted')
    expect(Array.isArray(snapshot.status.modified)).toBe(true)
    expect(Array.isArray(snapshot.status.added)).toBe(true)
    expect(Array.isArray(snapshot.status.deleted)).toBe(true)
  })

  test('getSnapshot is synchronous', async () => {
    const { getSnapshot, refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    await refreshSnapshot()
    
    const start = performance.now()
    const result = getSnapshot()
    const elapsed = performance.now() - start
    
    expect(result).not.toBeNull()
    expect(elapsed).toBeLessThan(5) // Should be essentially instant
  })

  test('refreshSnapshot returns cached data within TTL', async () => {
    const { refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    const first = await refreshSnapshot()
    await new Promise(r => setTimeout(r, 10))
    const second = await refreshSnapshot()
    
    // Within 100ms TTL, should return same cached data
    expect(second.timestamp).toBe(first.timestamp)
  })

  test('refreshSnapshot returns fresh data after TTL expires', async () => {
    const { refreshSnapshot, clearSnapshotCache } = await import('./jj.js')
    clearSnapshotCache()
    
    const first = await refreshSnapshot()
    // Wait for TTL to expire (100ms + buffer)
    await new Promise(r => setTimeout(r, 120))
    const second = await refreshSnapshot()
    
    expect(second.timestamp).toBeGreaterThan(first.timestamp)
  })
})
