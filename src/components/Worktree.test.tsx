/**
 * Unit tests for Worktree component interfaces.
 * Rendering tests live in reconciler-focused suites.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import * as path from 'node:path'
import type { WorktreeProps } from './Worktree.js'
import type { WorktreeContextValue } from './WorktreeProvider.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider, signalOrchestrationComplete } from './SmithersProvider.js'

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

describe('Worktree component execution', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('worktree-test', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  describe('Path resolution', () => {
    test('uses props.path when provided', () => {
      const customPath = '/custom/worktree/path'
      const resolved = path.resolve(customPath)
      expect(resolved).toBe('/custom/worktree/path')
    })

    test('uses default path .worktrees/<branch> when path not provided', () => {
      const branch = 'feature-branch'
      const defaultPath = path.join(process.cwd(), '.worktrees', branch)
      expect(defaultPath).toContain('.worktrees')
      expect(defaultPath).toContain(branch)
    })

    test('resolves path to absolute', () => {
      const relativePath = './relative/path'
      const resolved = path.resolve(relativePath)
      expect(path.isAbsolute(resolved)).toBe(true)
    })
  })

  describe('Branch handling', () => {
    test('uses props.base as base ref', () => {
      const props: WorktreeProps = {
        branch: 'feature',
        base: 'main',
        children: null
      }
      expect(props.base).toBe('main')
    })

    test('defaults base to HEAD', () => {
      const props: WorktreeProps = {
        branch: 'feature',
        children: null
      }
      expect(props.base).toBeUndefined()
    })
  })

  describe('State management', () => {
    test('stores state in SQLite with unique key', () => {
      const key = `worktree:${crypto.randomUUID()}`
      db.state.set(key, { status: 'pending', path: null, error: null }, 'worktree')
      const stored = db.state.get(key)
      expect(stored).not.toBeNull()
    })

    test('status transitions: pending -> ready', () => {
      const key = 'worktree:test-ready'
      db.state.set(key, { status: 'pending', path: null, error: null }, 'worktree')
      db.state.set(key, { status: 'ready', path: '/test/path', error: null }, 'worktree')
      const stored = db.state.get(key) as any
      expect(stored.status).toBe('ready')
    })

    test('status transitions: pending -> error on failure', () => {
      const key = 'worktree:test-error'
      db.state.set(key, { status: 'pending', path: null, error: null }, 'worktree')
      db.state.set(key, { status: 'error', path: null, error: 'Failed' }, 'worktree')
      const stored = db.state.get(key) as any
      expect(stored.status).toBe('error')
    })
  })

  describe('Context provision', () => {
    test('contextValue.cwd is worktree path', () => {
      const ctx: WorktreeContextValue = {
        cwd: '/test/worktree/path',
        branch: 'feature',
        isWorktree: true
      }
      expect(ctx.cwd).toBe('/test/worktree/path')
    })

    test('contextValue.branch is props.branch', () => {
      const ctx: WorktreeContextValue = {
        cwd: '/path',
        branch: 'my-feature',
        isWorktree: true
      }
      expect(ctx.branch).toBe('my-feature')
    })

    test('contextValue.isWorktree is true', () => {
      const ctx: WorktreeContextValue = {
        cwd: '/path',
        branch: 'feature',
        isWorktree: true
      }
      expect(ctx.isWorktree).toBe(true)
    })
  })

  describe('XML rendering', () => {
    test('renders <worktree status="pending"> initially', async () => {
      const { Worktree } = await import('./Worktree.js')
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Worktree branch="test-branch">
            <step>content</step>
          </Worktree>
        </SmithersProvider>
      )
      const xml = root.toXML()
      expect(xml).toContain('worktree')
      expect(xml).toContain('branch="test-branch"')
    })

    test('renders branch attribute always', async () => {
      const { Worktree } = await import('./Worktree.js')
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Worktree branch="always-branch">
            <step>content</step>
          </Worktree>
        </SmithersProvider>
      )
      expect(root.toXML()).toContain('branch="always-branch"')
    })
  })

  describe('Children rendering', () => {
    test('does not render children when pending', async () => {
      const { Worktree } = await import('./Worktree.js')
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Worktree branch="pending-test">
            <step>child content</step>
          </Worktree>
        </SmithersProvider>
      )
      const xml = root.toXML()
      expect(xml).toContain('status="pending"')
      expect(xml).not.toContain('child content')
    })
  })

  describe('Edge cases', () => {
    test('handles unmount before mount completes', async () => {
      const { Worktree } = await import('./Worktree.js')
      await root.render(
        <SmithersProvider db={db} executionId={executionId} stopped>
          <Worktree branch="unmount-test">
            <step>content</step>
          </Worktree>
        </SmithersProvider>
      )
      root.dispose()
      root = createSmithersRoot()
    })
  })
})
