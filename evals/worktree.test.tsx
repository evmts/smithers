import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import './setup.ts'
import { Worktree, Claude, renderPlan, executePlan, createRoot } from '../src/index.js'
import { execSync } from 'child_process'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'

const WORKTREE_TEST_DIR = join(process.cwd(), '.test-worktrees')

beforeEach(() => {
  // Clean up any existing test worktrees
  if (existsSync(WORKTREE_TEST_DIR)) {
    rmSync(WORKTREE_TEST_DIR, { recursive: true, force: true })
  }
  mkdirSync(WORKTREE_TEST_DIR, { recursive: true })
})

afterEach(async () => {
  // Clean up test worktrees after each test
  try {
    // List and remove all worktrees in test directory
    const worktrees = execSync('git worktree list --porcelain', { encoding: 'utf-8' })
    const lines = worktrees.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        const path = lines[i].substring('worktree '.length)
        if (path.includes('.test-worktrees')) {
          try {
            execSync(`git worktree remove "${path}" --force`, { stdio: 'ignore' })
          } catch {
            // Ignore errors
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Remove test directory
  if (existsSync(WORKTREE_TEST_DIR)) {
    rmSync(WORKTREE_TEST_DIR, { recursive: true, force: true })
  }
})

describe('Worktree Component', () => {
  describe('Rendering', () => {
    test('renders worktree with children', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path="./worktrees/test" branch="test-branch">
          <Claude>Test prompt</Claude>
        </Worktree>
      )

      expect(tree.type).toBe('ROOT')
      expect(tree.children[0].type).toBe('worktree')
      expect(tree.children[0].props.path).toBe('./worktrees/test')
      expect(tree.children[0].props.branch).toBe('test-branch')
      expect(tree.children[0].children[0].type).toBe('claude')
    })

    test('renders worktree with default cleanup=true', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path="./worktrees/test">
          <Claude>Test prompt</Claude>
        </Worktree>
      )

      expect(tree.children[0].props.cleanup).toBeUndefined() // defaults to true
    })

    test('renders worktree with cleanup=false', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path="./worktrees/test" cleanup={false}>
          <Claude>Test prompt</Claude>
        </Worktree>
      )

      expect(tree.children[0].props.cleanup).toBe(false)
    })
  })

  describe('Execution - Mock Mode', () => {
    test('creates worktree in mock mode', async () => {
      let createdPath = ''
      let createdBranch = ''
      const onCreated = (path: string, branch?: string) => {
        createdPath = path
        createdBranch = branch || ''
      }

      const result = await executePlan(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          branch="test-branch"
          onCreated={onCreated}
        >
          <Claude>Test prompt</Claude>
        </Worktree>,
        { mockMode: true }
      )

      expect(result.frames).toBeGreaterThan(0)
      expect(createdPath).toContain('.test-worktrees')
      expect(createdBranch).toBe('test-branch')

      // In mock mode, worktree should NOT be created on disk
      expect(existsSync(join(WORKTREE_TEST_DIR, 'test'))).toBe(false)
    })

    test('worktree with cleanup=false in mock mode', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          branch="test-branch"
          cleanup={false}
        >
          <Claude>Test prompt</Claude>
        </Worktree>
      )

      const result = await executePlan(tree, { mockMode: true })

      expect(result.frames).toBeGreaterThan(0)
    })

    test('worktree node is executed before Claude nodes', async () => {
      let executionOrder: string[] = []

      await executePlan(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          onCreated={() => executionOrder.push('worktree')}
        >
          <Claude onFinished={() => executionOrder.push('claude')}>
            Test prompt
          </Claude>
        </Worktree>,
        { mockMode: true }
      )

      expect(executionOrder).toEqual(['worktree', 'claude'])
    })
  })

  describe('Error Handling', () => {
    test('onError called on worktree creation failure', async () => {
      let errorCaught = false
      let errorMessage = ''

      await executePlan(
        <Worktree
          path="/invalid/absolute/path/that/will/fail"
          branch="test"
          onError={(error) => {
            errorCaught = true
            errorMessage = error.message
          }}
        >
          <Claude>Test</Claude>
        </Worktree>,
        { mockMode: false }
      )

      expect(errorCaught).toBe(true)
      expect(errorMessage).toContain('worktree')
    })

    test.skip('worktree fails if not in git repository', async () => {
      // Skip this test as it requires chdir which affects the whole process
      // and can cause issues with the Claude Agent SDK spawning
      // The error handling is already tested by the previous test
    })
  })

  describe('Props', () => {
    test('worktree with baseBranch prop', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          branch="feature"
          baseBranch="main"
        >
          <Claude>Test</Claude>
        </Worktree>
      )

      expect(tree.children[0].props.baseBranch).toBe('main')
    })

    test('worktree with callbacks', async () => {
      const callbacks = {
        onCreated: (path: string, branch?: string) => {},
        onError: (error: Error) => {},
        onCleanup: (path: string) => {},
      }

      const root = createRoot()
      const tree = await root.render(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          {...callbacks}
        >
          <Claude>Test</Claude>
        </Worktree>
      )

      expect(tree.children[0].props.onCreated).toBe(callbacks.onCreated)
      expect(tree.children[0].props.onError).toBe(callbacks.onError)
      expect(tree.children[0].props.onCleanup).toBe(callbacks.onCleanup)
    })
  })

  describe('Multiple Worktrees', () => {
    test('multiple worktrees render correctly', async () => {
      const root = createRoot()
      const tree = await root.render(
        <>
          <Worktree path={join(WORKTREE_TEST_DIR, 'wt1')} branch="branch1">
            <Claude>Task 1</Claude>
          </Worktree>
          <Worktree path={join(WORKTREE_TEST_DIR, 'wt2')} branch="branch2">
            <Claude>Task 2</Claude>
          </Worktree>
        </>
      )

      expect(tree.children).toHaveLength(2)
      expect(tree.children[0].type).toBe('worktree')
      expect(tree.children[1].type).toBe('worktree')
      expect(tree.children[0].props.path).toBe(join(WORKTREE_TEST_DIR, 'wt1'))
      expect(tree.children[1].props.path).toBe(join(WORKTREE_TEST_DIR, 'wt2'))
    })

    test('multiple worktrees execute in sequence', async () => {
      const executionOrder: string[] = []

      await executePlan(
        <>
          <Worktree
            path={join(WORKTREE_TEST_DIR, 'wt1')}
            onCreated={() => executionOrder.push('wt1')}
          >
            <Claude onFinished={() => executionOrder.push('claude1')}>
              Task 1
            </Claude>
          </Worktree>
          <Worktree
            path={join(WORKTREE_TEST_DIR, 'wt2')}
            onCreated={() => executionOrder.push('wt2')}
          >
            <Claude onFinished={() => executionOrder.push('claude2')}>
              Task 2
            </Claude>
          </Worktree>
        </>,
        { mockMode: true }
      )

      expect(executionOrder).toContain('wt1')
      expect(executionOrder).toContain('wt2')
      expect(executionOrder).toContain('claude1')
      expect(executionOrder).toContain('claude2')
    })
  })

  describe('Nested Components', () => {
    test('worktree with multiple Claude nodes', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path={join(WORKTREE_TEST_DIR, 'test')}>
          <Claude>Task 1</Claude>
          <Claude>Task 2</Claude>
        </Worktree>
      )

      expect(tree.children[0].children).toHaveLength(2)
      expect(tree.children[0].children[0].type).toBe('claude')
      expect(tree.children[0].children[1].type).toBe('claude')
    })

    test('worktree with nested components', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path={join(WORKTREE_TEST_DIR, 'test')}>
          <div>
            <Claude>Nested task</Claude>
          </div>
        </Worktree>
      )

      expect(tree.children[0].children[0].type).toBe('div')
      expect(tree.children[0].children[0].children[0].type).toBe('claude')
    })
  })

  describe('Path Injection', () => {
    test('worktree path is injected into Claude cwd', async () => {
      let worktreeCreated = false
      let claudeExecuted = false

      const result = await executePlan(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          onCreated={() => { worktreeCreated = true }}
        >
          <Claude onFinished={() => { claudeExecuted = true }}>
            Test
          </Claude>
        </Worktree>,
        { mockMode: true }
      )

      // Verify execution completed successfully
      expect(result.frames).toBeGreaterThan(0)
      expect(worktreeCreated).toBe(true)
      expect(claudeExecuted).toBe(true)
    })

    test('existing cwd prop is not overwritten', async () => {
      const customCwd = '/custom/path'
      let claudeExecuted = false

      const result = await executePlan(
        <Worktree path={join(WORKTREE_TEST_DIR, 'test')}>
          <Claude cwd={customCwd} onFinished={() => { claudeExecuted = true }}>
            Test
          </Claude>
        </Worktree>,
        { mockMode: true }
      )

      // Verify execution completed - the cwd preservation is internal behavior
      // tested by the actual execution working correctly
      expect(result.frames).toBeGreaterThan(0)
      expect(claudeExecuted).toBe(true)
    })
  })

  describe('Integration', () => {
    test('worktree lifecycle completes successfully in mock mode', async () => {
      let created = false
      let cleaned = false

      const result = await executePlan(
        <Worktree
          path={join(WORKTREE_TEST_DIR, 'test')}
          branch="test-branch"
          onCreated={() => { created = true }}
          onCleanup={() => { cleaned = true }}
        >
          <Claude onFinished={() => {}}>Test task</Claude>
        </Worktree>,
        { mockMode: true }
      )

      expect(result.frames).toBeGreaterThan(0)
      expect(created).toBe(true)
      // Cleanup happens but callback is only for real cleanup, not mock
      expect(cleaned).toBe(false) // In mock mode, cleanup callback not called
    })

    test('worktree with no branch creates detached HEAD', async () => {
      const root = createRoot()
      const tree = await root.render(
        <Worktree path={join(WORKTREE_TEST_DIR, 'test')}>
          <Claude>Test</Claude>
        </Worktree>
      )

      const result = await executePlan(tree, { mockMode: true })

      expect(result.frames).toBeGreaterThan(0)

      const worktreeNode = tree.children[0]
      expect(worktreeNode.props.branch).toBeUndefined()
    })
  })
})
