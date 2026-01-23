/**
 * TestRunner Component - Automated test execution with result parsing
 * Integrates with various test frameworks and provides real-time feedback
 */

import React, { useRef } from 'react'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'
import { WorkspaceManager } from '../utils/workspaceManager'
import { parseTestOutput, TestSummary, TestResult } from '../utils/testResultParser'

export interface TestRunnerProps {
  testCommand: string
  workspacePath: string
  testFiles?: string[]
  excludeFiles?: string[]
  timeout?: number
  parallel?: boolean
  maxWorkers?: number
  retryFailures?: boolean
  maxRetries?: number
  collectCoverage?: boolean
  coverageThreshold?: number
  watchMode?: boolean
  env?: Record<string, string>
  onTestStart?: () => void
  onTestComplete?: (results: TestSummary) => void
  onTestFailure?: (results: TestSummary) => void
  onTimeout?: () => void
  onChange?: (event: { type: 'file_change'; file: string }) => void
}

interface TestExecution {
  id: string
  command: string
  startTime: Date
  endTime?: Date
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  results?: TestSummary
  rawOutput?: string
  error?: string
}

/**
 * TestRunner component for automated test execution
 */
export function TestRunner({
  testCommand,
  workspacePath,
  testFiles,
  excludeFiles,
  timeout = 60000,
  parallel = false,
  maxWorkers = 4,
  retryFailures = false,
  maxRetries = 2,
  collectCoverage = false,
  coverageThreshold = 80,
  watchMode = false,
  env,
  onTestStart,
  onTestComplete,
  onTestFailure,
  onTimeout,
  onChange
}: TestRunnerProps) {
  const isMounted = useMountedState()
  const workspaceManagerRef = useRef<WorkspaceManager | null>(null)
  const executionRef = useRef<TestExecution | null>(null)
  const watcherRef = useRef<(() => void) | null>(null)

  // Initialize workspace manager
  useMount(() => {
    workspaceManagerRef.current = new WorkspaceManager({
      baseDir: workspacePath,
      timeout
    })

    startTestExecution()

    // Set up watch mode if enabled
    if (watchMode && onChange) {
      setupWatchMode()
    }
  })

  // Cleanup on unmount
  useUnmount(() => {
    if (watcherRef.current) {
      watcherRef.current()
    }
  })

  const setupWatchMode = () => {
    if (!workspaceManagerRef.current || !onChange) return

    watcherRef.current = workspaceManagerRef.current.watchWorkspace(
      workspacePath,
      (eventType, filename) => {
        if (eventType === 'change' && filename) {
          // Filter out non-test files if needed
          const isTestFile = testFiles?.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'))
            return regex.test(filename)
          }) ?? true

          const isExcluded = excludeFiles?.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'))
            return regex.test(filename)
          }) ?? false

          if (isTestFile && !isExcluded) {
            onChange({ type: 'file_change', file: filename })
            // Re-run tests on file change
            setTimeout(() => startTestExecution(), 500) // Debounce
          }
        }
      }
    )
  }

  const buildTestCommand = (attempt: number = 0): string => {
    let command = testCommand

    // Add test file patterns
    if (testFiles && testFiles.length > 0) {
      command += ` ${testFiles.join(' ')}`
    }

    // Add parallel execution options
    if (parallel) {
      if (command.includes('bun test')) {
        // Bun doesn't have explicit parallel flags, runs parallel by default
      } else if (command.includes('jest')) {
        command += ` --maxWorkers=${maxWorkers}`
      } else if (command.includes('vitest')) {
        command += ` --threads --maxThreads=${maxWorkers}`
      }
    }

    // Add coverage options
    if (collectCoverage) {
      if (command.includes('bun test')) {
        command += ' --coverage'
      } else if (command.includes('jest')) {
        command += ` --coverage --coverageThreshold='{"global":{"lines":${coverageThreshold},"functions":${coverageThreshold},"branches":${coverageThreshold},"statements":${coverageThreshold}}}'`
      } else if (command.includes('vitest')) {
        command += ` --coverage --coverage.threshold.lines=${coverageThreshold}`
      }
    }

    // Add retry suffix for retry attempts
    if (attempt > 0) {
      command += ` # Retry ${attempt}`
    }

    return command
  }

  const startTestExecution = async (attempt: number = 0): Promise<void> => {
    if (!isMounted() || !workspaceManagerRef.current) {
      return
    }

    const executionId = `test_${Date.now()}_${attempt}`
    const command = buildTestCommand(attempt)

    executionRef.current = {
      id: executionId,
      command,
      startTime: new Date(),
      status: 'running'
    }

    if (onTestStart) {
      onTestStart()
    }

    try {
      const result = await workspaceManagerRef.current.executeCommand(
        command,
        workspacePath,
        {
          timeout,
          env: {
            NODE_ENV: 'test',
            ...env
          }
        }
      )

      if (!isMounted() || !executionRef.current) {
        return
      }

      executionRef.current.endTime = new Date()
      executionRef.current.rawOutput = result.stdout + result.stderr

      if (result.success) {
        // Parse test results
        const testResults = parseTestOutput(result.stdout, 'auto')

        executionRef.current.status = 'completed'
        executionRef.current.results = testResults

        // Check coverage threshold if enabled
        if (collectCoverage && testResults.coverage) {
          const coverage = testResults.coverage
          const meetsThreshold = (
            coverage.lines >= coverageThreshold &&
            coverage.functions >= coverageThreshold &&
            coverage.branches >= coverageThreshold &&
            coverage.statements >= coverageThreshold
          )

          if (!meetsThreshold) {
            executionRef.current.status = 'failed'
            executionRef.current.error = `Coverage below threshold: Lines ${coverage.lines}%, Functions ${coverage.functions}%, Branches ${coverage.branches}%, Statements ${coverage.statements}%`

            if (onTestFailure) {
              onTestFailure(testResults)
            }
            return
          }
        }

        if (testResults.passed) {
          if (onTestComplete) {
            onTestComplete(testResults)
          }
        } else {
          // Tests failed - retry if enabled
          if (retryFailures && attempt < maxRetries) {
            console.log(`Tests failed, retrying... (${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
            return startTestExecution(attempt + 1)
          }

          executionRef.current.status = 'failed'
          if (onTestFailure) {
            onTestFailure(testResults)
          }
        }

      } else {
        // Command failed
        if (result.stderr.includes('timeout') || result.stderr.includes('TIMEOUT')) {
          executionRef.current.status = 'timeout'
          executionRef.current.error = 'Test execution timed out'

          if (onTimeout) {
            onTimeout()
          }
        } else {
          // Retry if enabled
          if (retryFailures && attempt < maxRetries) {
            console.log(`Test execution failed, retrying... (${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
            return startTestExecution(attempt + 1)
          }

          executionRef.current.status = 'failed'
          executionRef.current.error = result.stderr || 'Test execution failed'

          // Try to parse partial results
          const partialResults = parseTestOutput(result.stdout || result.stderr, 'auto')
          executionRef.current.results = partialResults

          if (onTestFailure) {
            onTestFailure(partialResults)
          }
        }
      }

    } catch (error) {
      if (!isMounted() || !executionRef.current) {
        return
      }

      const errorMessage = error instanceof Error ? error.message : String(error)

      executionRef.current.endTime = new Date()
      executionRef.current.status = 'failed'
      executionRef.current.error = errorMessage

      // Retry if enabled
      if (retryFailures && attempt < maxRetries && !errorMessage.includes('timeout')) {
        console.log(`Test execution error, retrying... (${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        return startTestExecution(attempt + 1)
      }

      const emptyResults: TestSummary = {
        passed: false,
        total: 0,
        failed: 0,
        format: 'unknown',
        results: []
      }

      if (onTestFailure) {
        onTestFailure(emptyResults)
      }
    }
  }

  const getExecutionStatus = () => {
    return executionRef.current?.status || 'pending'
  }

  const getResults = (): TestSummary | null => {
    return executionRef.current?.results || null
  }

  const getDuration = (): number | null => {
    const execution = executionRef.current
    if (!execution || !execution.endTime) {
      return null
    }
    return execution.endTime.getTime() - execution.startTime.getTime()
  }

  const rerun = () => {
    startTestExecution()
  }

  return (
    <div className="test-runner">
      <div className="header">
        <h2>Test Runner</h2>
        <div className="controls">
          <button onClick={rerun} disabled={getExecutionStatus() === 'running'}>
            {getExecutionStatus() === 'running' ? 'Running...' : 'Run Tests'}
          </button>
          {watchMode && (
            <span className="watch-indicator">👁️ Watch Mode</span>
          )}
        </div>
      </div>

      <div className="execution-info">
        <div className="command">
          <strong>Command:</strong> <code>{executionRef.current?.command || testCommand}</code>
        </div>
        <div className="workspace">
          <strong>Workspace:</strong> <code>{workspacePath}</code>
        </div>
        {getDuration() && (
          <div className="duration">
            <strong>Duration:</strong> {getDuration()}ms
          </div>
        )}
      </div>

      <div className="status">
        <TestExecutionStatus
          status={getExecutionStatus()}
          results={getResults()}
          error={executionRef.current?.error}
        />
      </div>

      {getResults() && (
        <TestResultsDisplay results={getResults()!} />
      )}

      {executionRef.current?.rawOutput && (
        <div className="raw-output">
          <details>
            <summary>Raw Output</summary>
            <pre>{executionRef.current.rawOutput}</pre>
          </details>
        </div>
      )}
    </div>
  )
}

/**
 * Test execution status indicator
 */
interface TestExecutionStatusProps {
  status: string
  results?: TestSummary | null
  error?: string
}

function TestExecutionStatus({ status, results, error }: TestExecutionStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'running': return '⏳'
      case 'completed': return results?.passed ? '✅' : '❌'
      case 'failed': return '❌'
      case 'timeout': return '⏰'
      default: return '⏸️'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'running': return 'Running tests...'
      case 'completed': return results?.passed ? 'All tests passed' : 'Some tests failed'
      case 'failed': return 'Test execution failed'
      case 'timeout': return 'Test execution timed out'
      default: return 'Ready to run tests'
    }
  }

  return (
    <div className={`execution-status ${status}`}>
      <span className="status-icon">{getStatusIcon()}</span>
      <span className="status-text">{getStatusText()}</span>
      {error && <span className="error-message">: {error}</span>}
    </div>
  )
}

/**
 * Test results display component
 */
interface TestResultsDisplayProps {
  results: TestSummary
}

function TestResultsDisplay({ results }: TestResultsDisplayProps) {
  return (
    <div className="test-results">
      <div className="summary">
        <div className="stat">
          <span className="label">Total:</span>
          <span className="value">{results.total}</span>
        </div>
        <div className="stat">
          <span className="label">Passed:</span>
          <span className="value passed">{results.total - results.failed}</span>
        </div>
        <div className="stat">
          <span className="label">Failed:</span>
          <span className="value failed">{results.failed}</span>
        </div>
        {results.skipped && (
          <div className="stat">
            <span className="label">Skipped:</span>
            <span className="value skipped">{results.skipped}</span>
          </div>
        )}
        {results.duration && (
          <div className="stat">
            <span className="label">Duration:</span>
            <span className="value">{results.duration}ms</span>
          </div>
        )}
      </div>

      {results.coverage && (
        <div className="coverage">
          <h3>Coverage</h3>
          <div className="coverage-metrics">
            <div className="metric">
              <span>Lines:</span>
              <span className={results.coverage.lines >= 80 ? 'good' : 'needs-improvement'}>
                {results.coverage.lines}%
              </span>
            </div>
            <div className="metric">
              <span>Functions:</span>
              <span className={results.coverage.functions >= 80 ? 'good' : 'needs-improvement'}>
                {results.coverage.functions}%
              </span>
            </div>
            <div className="metric">
              <span>Branches:</span>
              <span className={results.coverage.branches >= 80 ? 'good' : 'needs-improvement'}>
                {results.coverage.branches}%
              </span>
            </div>
            <div className="metric">
              <span>Statements:</span>
              <span className={results.coverage.statements >= 80 ? 'good' : 'needs-improvement'}>
                {results.coverage.statements}%
              </span>
            </div>
          </div>
        </div>
      )}

      {results.results && results.results.length > 0 && (
        <div className="test-details">
          <details>
            <summary>Individual Test Results ({results.results.length})</summary>
            <div className="test-list">
              {results.results.map((test, index) => (
                <TestResultItem key={index} test={test} />
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

/**
 * Individual test result item
 */
interface TestResultItemProps {
  test: TestResult
}

function TestResultItem({ test }: TestResultItemProps) {
  const getStatusIcon = () => {
    switch (test.status) {
      case 'passed': return '✅'
      case 'failed': return '❌'
      case 'skipped': return '⏭️'
      case 'timeout': return '⏰'
      default: return '❓'
    }
  }

  return (
    <div className={`test-result-item ${test.status}`}>
      <div className="test-header">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="test-name">{test.testName}</span>
        <span className="test-file">{test.file}</span>
        {test.duration && <span className="duration">({test.duration}ms)</span>}
      </div>

      {test.error && (
        <div className="test-error">
          <pre>{test.error}</pre>
        </div>
      )}
    </div>
  )
}