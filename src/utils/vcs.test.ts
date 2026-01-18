/**
 * Unit tests for vcs.ts - VCS utilities for git and jj operations.
 */
import { describe, test, expect } from 'bun:test'
import { parseGitStatus, parseJJStatus, parseDiffStats, isGitRepo, getCurrentBranch } from './vcs'

describe('parseGitStatus', () => {
  test('parses modified files', () => {
    const output = `M  src/file1.ts
 M src/file2.ts`

    const result = parseGitStatus(output)

    expect(result.modified).toContain('src/file1.ts')
    expect(result.modified).toContain('src/file2.ts')
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('parses added files', () => {
    const output = `A  src/new-file.ts
A  src/another.ts`

    const result = parseGitStatus(output)

    expect(result.added).toContain('src/new-file.ts')
    expect(result.added).toContain('src/another.ts')
  })

  test('AM status goes to modified (has M)', () => {
    // AM = Added then Modified in staging
    // Current implementation checks M first, so AM goes to modified
    const output = `AM src/added-modified.ts`

    const result = parseGitStatus(output)

    expect(result.modified).toContain('src/added-modified.ts')
  })

  test('parses deleted files', () => {
    const output = `D  src/removed.ts
 D src/deleted.ts`

    const result = parseGitStatus(output)

    expect(result.deleted).toContain('src/removed.ts')
    expect(result.deleted).toContain('src/deleted.ts')
  })

  test('parses mixed status', () => {
    const output = `M  src/modified.ts
A  src/added.ts
D  src/deleted.ts
?? src/untracked.ts`

    const result = parseGitStatus(output)

    expect(result.modified).toContain('src/modified.ts')
    expect(result.added).toContain('src/added.ts')
    expect(result.deleted).toContain('src/deleted.ts')
    // Untracked files are not included (no M, A, or D status)
  })

  test('handles empty output', () => {
    const result = parseGitStatus('')

    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })

  test('handles whitespace-only lines', () => {
    const output = `M  src/file.ts

   
A  src/other.ts`

    const result = parseGitStatus(output)

    expect(result.modified).toHaveLength(1)
    expect(result.added).toHaveLength(1)
  })
})

describe('parseJJStatus', () => {
  test('parses modified files', () => {
    const output = `M src/file1.ts
M src/file2.ts`

    const result = parseJJStatus(output)

    expect(result.modified).toContain('src/file1.ts')
    expect(result.modified).toContain('src/file2.ts')
  })

  test('parses added files', () => {
    const output = `A src/new-file.ts
A src/another.ts`

    const result = parseJJStatus(output)

    expect(result.added).toContain('src/new-file.ts')
    expect(result.added).toContain('src/another.ts')
  })

  test('parses deleted files', () => {
    const output = `D src/removed.ts
D src/deleted.ts`

    const result = parseJJStatus(output)

    expect(result.deleted).toContain('src/removed.ts')
    expect(result.deleted).toContain('src/deleted.ts')
  })

  test('parses mixed status', () => {
    const output = `M src/modified.ts
A src/added.ts
D src/deleted.ts`

    const result = parseJJStatus(output)

    expect(result.modified).toContain('src/modified.ts')
    expect(result.added).toContain('src/added.ts')
    expect(result.deleted).toContain('src/deleted.ts')
  })

  test('handles empty output', () => {
    const result = parseJJStatus('')

    expect(result.modified).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(result.deleted).toHaveLength(0)
  })
})

describe('parseDiffStats', () => {
  test('parses file change lines', () => {
    const output = ` src/file1.ts | 10 ++++++----
 src/file2.ts | 5 +++++
 src/file3.ts | 3 ---`

    const result = parseDiffStats(output)

    expect(result.files).toHaveLength(3)
    expect(result.files).toContain('src/file1.ts')
    expect(result.files).toContain('src/file2.ts')
    expect(result.files).toContain('src/file3.ts')
  })

  test('counts insertions correctly', () => {
    const output = ` src/file1.ts | 10 ++++++----`

    const result = parseDiffStats(output)

    // 6 + symbols
    expect(result.insertions).toBe(6)
  })

  test('counts deletions correctly', () => {
    const output = ` src/file1.ts | 10 ++++++----`

    const result = parseDiffStats(output)

    // 4 - symbols
    expect(result.deletions).toBe(4)
  })

  test('sums insertions and deletions across files', () => {
    const output = ` src/file1.ts | 10 ++++++----
 src/file2.ts | 5 +++++
 src/file3.ts | 3 ---`

    const result = parseDiffStats(output)

    // file1: 6+, 4-; file2: 5+, 0-; file3: 0+, 3-
    expect(result.insertions).toBe(11)
    expect(result.deletions).toBe(7)
  })

  test('handles empty output', () => {
    const result = parseDiffStats('')

    expect(result.files).toHaveLength(0)
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  test('ignores summary lines', () => {
    const output = ` src/file.ts | 10 +++++++---
 2 files changed, 10 insertions(+), 5 deletions(-)`

    const result = parseDiffStats(output)

    // Only the first line should match
    expect(result.files).toHaveLength(1)
  })
})

describe('isGitRepo', () => {
  test('returns true in current directory (which is a git repo)', async () => {
    const result = await isGitRepo()
    expect(result).toBe(true)
  })
})

describe('getCurrentBranch', () => {
  test('returns branch name in a git repo', async () => {
    const branch = await getCurrentBranch()
    // We're in a git repo, so should return something
    expect(typeof branch).toBe('string')
  })
})
