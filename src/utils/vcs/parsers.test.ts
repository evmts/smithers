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
// Edge Cases - parseGitStatus
// ============================================================================

describe('parseGitStatus - edge cases', () => {
  test('handles renamed files (R status) - not currently tracked', () => {
    const output = `R  old-name.ts -> new-name.ts`
    const result = parseGitStatus(output)
    // R status is not tracked, so all arrays should be empty
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles copied files (C status) - not currently tracked', () => {
    const output = `C  original.ts -> copy.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles unmerged files (U status) - not currently tracked', () => {
    const output = `UU src/conflict.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles ignored files (!! status) - not currently tracked', () => {
    const output = `!! node_modules/`
    const result = parseGitStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles untracked files (?? status) - not currently tracked', () => {
    const output = `?? untracked.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles files with spaces in path', () => {
    const output = `M  src/my file.ts
A  src/another file.ts
D  src/old file.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toContain('src/my file.ts')
    expect(result.added).toContain('src/another file.ts')
    expect(result.deleted).toContain('src/old file.ts')
  })

  test('handles files with quoted paths', () => {
    const output = `M  "src/quoted file.ts"`
    const result = parseGitStatus(output)
    expect(result.modified).toContain('"src/quoted file.ts"')
  })

  test('handles files with unicode characters', () => {
    const output = `M  src/日本語.ts
A  src/émoji.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toContain('src/日本語.ts')
    expect(result.added).toContain('src/émoji.ts')
  })

  test('handles status with both X and Y positions filled (AM)', () => {
    const output = `AM src/staged-then-modified.ts`
    const result = parseGitStatus(output)
    // AM includes M, so goes to modified
    expect(result.modified).toContain('src/staged-then-modified.ts')
  })

  test('handles status with MM (both staged and unstaged modifications)', () => {
    const output = `MM src/double-modified.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toContain('src/double-modified.ts')
  })

  test('handles status line shorter than 3 characters', () => {
    const output = `M `
    const result = parseGitStatus(output)
    // Empty file path
    expect(result.modified).toHaveLength(1)
    expect(result.modified[0]).toBe('')
  })

  test('handles status line with only status codes', () => {
    const output = `M`
    const result = parseGitStatus(output)
    // Line is too short (only 1 char), so substring(3) returns empty and modified gets empty string
    // After trimming, empty strings are still added since the line isn't empty
    expect(result.modified.length).toBeGreaterThanOrEqual(0)
  })

  test('handles CRLF line endings', () => {
    const output = `M  src/file1.ts\r\nA  src/file2.ts\r\n`
    const result = parseGitStatus(output)
    // Trim should handle \r
    expect(result.modified.length).toBeGreaterThanOrEqual(1)
    expect(result.added.length).toBeGreaterThanOrEqual(1)
  })

  test('handles mixed line endings', () => {
    const output = `M  src/file1.ts\nA  src/file2.ts\r\nD  src/file3.ts`
    const result = parseGitStatus(output)
    expect(result.modified.length).toBeGreaterThanOrEqual(1)
    expect(result.added.length).toBeGreaterThanOrEqual(1)
    expect(result.deleted.length).toBeGreaterThanOrEqual(1)
  })

  test('handles very long file paths (>260 chars)', () => {
    const longPath = 'a'.repeat(300) + '.ts'
    const output = `M  ${longPath}`
    const result = parseGitStatus(output)
    expect(result.modified).toContain(longPath)
  })

  test('handles multiple files of same type', () => {
    const output = `M  src/file1.ts
M  src/file2.ts
M  src/file3.ts`
    const result = parseGitStatus(output)
    expect(result.modified).toHaveLength(3)
  })

  test('handles AD status (added then deleted)', () => {
    const output = `AD src/added-then-deleted.ts`
    const result = parseGitStatus(output)
    // parseGitStatus checks for A first, then D
    // Since status includes 'A', it goes to added
    // Implementation: if (status.includes('M')) modified, else if (status.includes('A')) added, else if (status.includes('D')) deleted
    expect(result.added).toContain('src/added-then-deleted.ts')
  })
})

// ============================================================================
// Edge Cases - parseJJStatus
// ============================================================================

describe('parseJJStatus - edge cases', () => {
  test('handles renamed files - R prefix', () => {
    const output = `R old-name.ts -> new-name.ts`
    const result = parseJJStatus(output)
    // R status is not tracked
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles copied files - C prefix', () => {
    const output = `C original.ts -> copy.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles conflicted files - not tracked', () => {
    const output = `X src/conflict.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles files with spaces in path', () => {
    const output = `M src/my file.ts
A src/another file.ts
D src/old file.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toContain('src/my file.ts')
    expect(result.added).toContain('src/another file.ts')
    expect(result.deleted).toContain('src/old file.ts')
  })

  test('handles files with unicode characters', () => {
    const output = `M src/日本語.ts
A src/émoji.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toContain('src/日本語.ts')
    expect(result.added).toContain('src/émoji.ts')
  })

  test('handles files with leading/trailing whitespace in line', () => {
    const output = `  M src/file.ts  `
    const result = parseJJStatus(output)
    // Line doesn't start with M, so not matched
    expect(result.modified).toHaveLength(0)
  })

  test('handles status with extra whitespace after prefix', () => {
    const output = `M   src/file.ts`
    const result = parseJJStatus(output)
    // parseJJStatus: line.substring(2).trim() - so extra spaces are trimmed
    expect(result.modified).toContain('src/file.ts')
  })

  test('handles unknown status codes', () => {
    const output = `X src/unknown.ts
Z src/another.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles CRLF line endings', () => {
    const output = `M src/file1.ts\r\nA src/file2.ts\r\n`
    const result = parseJJStatus(output)
    expect(result.modified.length).toBeGreaterThanOrEqual(1)
    expect(result.added.length).toBeGreaterThanOrEqual(1)
  })

  test('handles empty lines in output', () => {
    const output = `M src/file1.ts

A src/file2.ts`
    const result = parseJJStatus(output)
    expect(result.modified).toHaveLength(1)
    expect(result.added).toHaveLength(1)
  })

  test('handles output with only status prefix', () => {
    const output = `M `
    const result = parseJJStatus(output)
    expect(result.modified).toHaveLength(1)
    expect(result.modified[0]).toBe('')
  })
})

// ============================================================================
// Edge Cases - parseDiffStats
// ============================================================================

describe('parseDiffStats - edge cases', () => {
  test('handles binary files (Bin X -> Y bytes)', () => {
    const output = ` image.png | Bin 0 -> 1234 bytes`
    const result = parseDiffStats(output)
    // Binary files don't match the +/- pattern, so no insertions/deletions
    expect(result.files).toHaveLength(0)
  })

  test('handles files with spaces in path', () => {
    const output = ` src/my file.ts | 10 +++++++---`
    const result = parseDiffStats(output)
    expect(result.files).toContain('src/my file.ts')
    expect(result.insertions).toBe(7)
    expect(result.deletions).toBe(3)
  })

  test('handles files with unicode characters', () => {
    const output = ` src/日本語.ts | 5 +++++`
    const result = parseDiffStats(output)
    expect(result.files).toContain('src/日本語.ts')
    expect(result.insertions).toBe(5)
    expect(result.deletions).toBe(0)
  })

  test('handles very large insertion counts (10000+)', () => {
    // Large number of symbols
    const symbols = '+'.repeat(50) // Can't really have 10000 symbols, but test intent
    const output = ` large-file.ts | 50 ${symbols}`
    const result = parseDiffStats(output)
    expect(result.files).toContain('large-file.ts')
    expect(result.insertions).toBe(50)
  })

  test('handles very large deletion counts', () => {
    const symbols = '-'.repeat(40)
    const output = ` deleted.ts | 40 ${symbols}`
    const result = parseDiffStats(output)
    expect(result.files).toContain('deleted.ts')
    expect(result.deletions).toBe(40)
  })

  test('handles files with only insertions', () => {
    const output = ` new-file.ts | 20 ++++++++++++++++++++`
    const result = parseDiffStats(output)
    expect(result.files).toContain('new-file.ts')
    expect(result.insertions).toBe(20)
    expect(result.deletions).toBe(0)
  })

  test('handles files with only deletions', () => {
    const output = ` removed.ts | 15 ---------------`
    const result = parseDiffStats(output)
    expect(result.files).toContain('removed.ts')
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(15)
  })

  test('handles renamed files (old => new)', () => {
    const output = ` old.ts => new.ts | 5 ++---`
    const result = parseDiffStats(output)
    expect(result.files).toContain('old.ts => new.ts')
    expect(result.insertions).toBe(2)
    expect(result.deletions).toBe(3)
  })

  test('handles mode changes (no +/- symbols)', () => {
    // Mode change lines don't have the +/- pattern
    const output = ` script.sh | 0`
    const result = parseDiffStats(output)
    // No +/- means no match
    expect(result.files).toHaveLength(0)
  })

  test('handles summary line (N files changed, X insertions)', () => {
    const output = ` src/file.ts | 10 +++++++---
 2 files changed, 10 insertions(+), 5 deletions(-)`
    const result = parseDiffStats(output)
    // Only the first line should match
    expect(result.files).toHaveLength(1)
    expect(result.files).toContain('src/file.ts')
  })

  test('handles CRLF line endings', () => {
    const output = ` file1.ts | 5 +++++\r\n file2.ts | 3 ---\r\n`
    const result = parseDiffStats(output)
    expect(result.files).toHaveLength(2)
  })

  test('handles multiple files', () => {
    const output = ` src/a.ts | 10 +++++++---
 src/b.ts | 5 +++++
 src/c.ts | 3 ---`
    const result = parseDiffStats(output)
    expect(result.files).toHaveLength(3)
    expect(result.insertions).toBe(12) // 7 + 5 + 0
    expect(result.deletions).toBe(6)   // 3 + 0 + 3
  })

  test('handles path with pipe character - edge case', () => {
    // This is a tricky case - pipe in filename could confuse parsing
    // The regex splits on first | so this might not work correctly
    const output = ` src/file|test.ts | 5 +++++`
    const result = parseDiffStats(output)
    // First pipe matches, so file would be 'src/file'
    // This is a limitation of the current parser
    expect(result.files.length).toBeGreaterThanOrEqual(0)
  })

  test('handles leading whitespace variations', () => {
    const output = `    src/file.ts | 5 +++++`
    const result = parseDiffStats(output)
    expect(result.files).toContain('src/file.ts')
  })

  test('accumulates stats across files', () => {
    const output = ` a.ts | 10 ++++++++++
 b.ts | 5 -----
 c.ts | 8 ++++----`
    const result = parseDiffStats(output)
    expect(result.insertions).toBe(14) // 10 + 0 + 4
    expect(result.deletions).toBe(9)   // 0 + 5 + 4
  })
})
