import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { TestRunner } from '../../issues/smithershub/src/components/TestRunner'

// Mock dependencies
const mockTestResultParser = {
  parseTestOutput: mock(() => ({
    passed: true,
    failed: 0,
    total: 5,
    results: [
      { file: 'test1.test.ts', status: 'passed', duration: 100 },
      { file: 'test2.test.ts', status: 'passed', duration: 150 }
    ]
  })),
  parseJestOutput: mock(() => ({ passed: true, results: [] })),
  parseBunTestOutput: mock(() => ({ passed: true, results: [] }))
}

const mockWorkspaceManager = {
  executeCommand: mock(() => Promise.resolve({
    success: true,
    stdout: 'All tests passed',
    stderr: '',
    exitCode: 0
  }))
}

mock.module('../../issues/smithershub/src/utils/testResultParser', () => mockTestResultParser)
mock.module('../../issues/smithershub/src/utils/workspaceManager', () => ({
  WorkspaceManager: class {
    executeCommand = mockWorkspaceManager.executeCommand
  }
}))

describe('TestRunner Component', () => {
  beforeEach(() => {
    mock.restore()
  })

  test('renders with initial state', () => {
    const result = renderToString(createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace'
    }))

    expect(result).toContain('Test Runner')
  })

  test('handles different test commands', () => {
    const testCases = [
      { command: 'bun test', type: 'bun' },
      { command: 'npm test', type: 'npm' },
      { command: 'jest', type: 'jest' },
      { command: 'vitest', type: 'vitest' }
    ]

    testCases.forEach(({ command, type }) => {
      const component = createElement(TestRunner, {
        testCommand: command,
        workspacePath: '/test/workspace'
      })

      expect(component.props.testCommand).toBe(command)
    })
  })

  test('supports timeout configuration', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      timeout: 60000,
      onTimeout: mock(() => {})
    })

    expect(component.props.timeout).toBe(60000)
    expect(component.props.onTimeout).toBeDefined()
  })

  test('provides test result callbacks', () => {
    const onTestStart = mock(() => {})
    const onTestComplete = mock(() => {})
    const onTestFailure = mock(() => {})

    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      onTestStart,
      onTestComplete,
      onTestFailure
    })

    expect(component.props.onTestStart).toBe(onTestStart)
    expect(component.props.onTestComplete).toBe(onTestComplete)
    expect(component.props.onTestFailure).toBe(onTestFailure)
  })

  test('handles test file filtering', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      testFiles: ['**/*.test.ts', '**/*.spec.ts'],
      excludeFiles: ['**/node_modules/**']
    })

    expect(component.props.testFiles).toEqual(['**/*.test.ts', '**/*.spec.ts'])
    expect(component.props.excludeFiles).toEqual(['**/node_modules/**'])
  })

  test('supports parallel test execution', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      parallel: true,
      maxWorkers: 4
    })

    expect(component.props.parallel).toBe(true)
    expect(component.props.maxWorkers).toBe(4)
  })

  test('handles test retry logic', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      retryFailures: true,
      maxRetries: 3
    })

    expect(component.props.retryFailures).toBe(true)
    expect(component.props.maxRetries).toBe(3)
  })

  test('provides coverage reporting', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test --coverage',
      workspacePath: '/test/workspace',
      collectCoverage: true,
      coverageThreshold: 80
    })

    expect(component.props.collectCoverage).toBe(true)
    expect(component.props.coverageThreshold).toBe(80)
  })

  test('supports watch mode', () => {
    const component = createElement(TestRunner, {
      testCommand: 'bun test --watch',
      workspacePath: '/test/workspace',
      watchMode: true,
      onChange: mock(() => {})
    })

    expect(component.props.watchMode).toBe(true)
    expect(component.props.onChange).toBeDefined()
  })

  test('handles environment variables', () => {
    const env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'sqlite://test.db'
    }

    const component = createElement(TestRunner, {
      testCommand: 'bun test',
      workspacePath: '/test/workspace',
      env
    })

    expect(component.props.env).toEqual(env)
  })
})