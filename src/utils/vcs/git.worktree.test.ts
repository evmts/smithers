import { describe, test, expect } from 'bun:test'
import { parseWorktreeList } from './git.js'

describe('parseWorktreeList', () => {
  test('parses single worktree with branch', () => {
    const output = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      'locked',
      'prunable',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/repo',
      head: 'abc123',
      branch: 'main',
      locked: true,
      prunable: true,
    })
  })

  test('parses detached worktree', () => {
    const output = ['worktree /repo/wt', 'HEAD def456', 'detached', ''].join('\n')
    const result = parseWorktreeList(output)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/repo/wt',
      head: 'def456',
      branch: null,
    })
  })

  test('parses multiple worktrees', () => {
    const output = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      'worktree /repo/feature',
      'HEAD def456',
      'branch refs/heads/feature',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      path: '/repo',
      head: 'abc123',
      branch: 'main',
    })
    expect(result[1]).toEqual({
      path: '/repo/feature',
      head: 'def456',
      branch: 'feature',
    })
  })

  test('handles empty output', () => {
    const result = parseWorktreeList('')
    expect(result).toEqual([])
  })

  test('handles whitespace-only output', () => {
    const result = parseWorktreeList('   \n\t  \n')
    expect(result).toEqual([])
  })

  test('handles worktree with path containing spaces', () => {
    const output = [
      'worktree /Users/dev/my project',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/Users/dev/my project')
  })

  test('handles bare worktree', () => {
    const output = [
      'worktree /repo.git',
      'HEAD abc123',
      'bare',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/repo.git',
      head: 'abc123',
      branch: null,
    })
  })

  test('handles worktree without locked/prunable', () => {
    const output = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result[0].locked).toBeUndefined()
    expect(result[0].prunable).toBeUndefined()
  })

  test('handles full 40-char HEAD hash', () => {
    const fullHash = 'abc1234def5678abc1234def5678abc1234def56'
    const output = [
      'worktree /repo',
      `HEAD ${fullHash}`,
      'branch refs/heads/main',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result[0].head).toBe(fullHash)
  })

  test('handles feature branch with slashes', () => {
    const output = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/feature/my-feature',
      '',
    ].join('\n')

    const result = parseWorktreeList(output)
    expect(result[0].branch).toBe('feature/my-feature')
  })
})
