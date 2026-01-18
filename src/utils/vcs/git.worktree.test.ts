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
})
