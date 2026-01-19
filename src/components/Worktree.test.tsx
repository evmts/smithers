/**
 * Unit tests for Worktree component interfaces.
 * Rendering tests live in reconciler-focused suites.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { WorktreeProps } from './Worktree.js'
import type { WorktreeContextValue } from './WorktreeProvider.js'

describe('WorktreeProps interface', () => {
  test('requires branch', () => {
    const props: WorktreeProps = { branch: 'feature', children: null }
    expect(props.branch).toBe('feature')
  })

  test('accepts optional base/path/cleanup', () => {
    const props: WorktreeProps = {
      branch: 'feature',
      base: 'main',
      path: '/tmp/feature',
      cleanup: true,
      children: null,
    }
    expect(props.base).toBe('main')
    expect(props.path).toBe('/tmp/feature')
    expect(props.cleanup).toBe(true)
  })

  test('accepts onReady callback', () => {
    const onReady = mock(() => {})
    const props: WorktreeProps = { branch: 'feature', children: null, onReady }
    props.onReady?.('/tmp/feature')
    expect(onReady).toHaveBeenCalledWith('/tmp/feature')
  })

  test('accepts onError callback', () => {
    const onError = mock(() => {})
    const props: WorktreeProps = { branch: 'feature', children: null, onError }
    const error = new Error('test')
    props.onError?.(error)
    expect(onError).toHaveBeenCalledWith(error)
  })
})

describe('WorktreeContextValue interface', () => {
  test('contains cwd/branch/isWorktree fields', () => {
    const ctx: WorktreeContextValue = {
      cwd: '/repo/.worktrees/feature',
      branch: 'feature',
      isWorktree: true,
    }
    expect(ctx.cwd).toBe('/repo/.worktrees/feature')
    expect(ctx.branch).toBe('feature')
    expect(ctx.isWorktree).toBe(true)
  })
})

describe('Index exports Worktree', () => {
  test('exports Worktree from index', async () => {
    const index = await import('./index.js')
    expect(index.Worktree).toBeDefined()
  })

  test('exports useWorktree from index', async () => {
    const index = await import('./index.js')
    expect(index.useWorktree).toBeDefined()
  })
})
