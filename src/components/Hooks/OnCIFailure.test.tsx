/**
 * Unit tests for Hooks/OnCIFailure.tsx - CI failure hook component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { OnCIFailureProps, CIFailure } from './OnCIFailure'

describe('OnCIFailureProps interface', () => {
  test('provider is required', () => {
    const props: OnCIFailureProps = {
      provider: 'github-actions',
      children: null as any,
    }
    expect(props.provider).toBe('github-actions')
  })

  test('pollInterval is optional', () => {
    const props: OnCIFailureProps = {
      provider: 'github-actions',
      children: null as any,
    }
    expect(props.pollInterval).toBeUndefined()
  })

  test('pollInterval can be set', () => {
    const props: OnCIFailureProps = {
      provider: 'github-actions',
      pollInterval: 60000,
      children: null as any,
    }
    expect(props.pollInterval).toBe(60000)
  })

  test('onFailure is optional callback', () => {
    const callback = mock(() => {})
    const props: OnCIFailureProps = {
      provider: 'github-actions',
      onFailure: callback,
      children: null as any,
    }

    const failure: CIFailure = {
      failed: true,
      runId: '12345',
      workflowName: 'CI',
      failedJobs: ['test', 'lint'],
      logs: 'Error: test failed',
    }

    props.onFailure?.(failure)
    expect(callback).toHaveBeenCalledWith(failure)
  })

  test('children is required', () => {
    const props: OnCIFailureProps = {
      provider: 'github-actions',
      children: null as any,
    }
    expect(props.children).toBeNull()
  })
})

describe('CIFailure interface', () => {
  test('minimal failure', () => {
    const failure: CIFailure = {
      failed: true,
    }

    expect(failure.failed).toBe(true)
    expect(failure.runId).toBeUndefined()
    expect(failure.workflowName).toBeUndefined()
  })

  test('full failure with all fields', () => {
    const failure: CIFailure = {
      failed: true,
      runId: '123456789',
      workflowName: 'Build and Test',
      failedJobs: ['unit-tests', 'integration-tests'],
      logs: 'Test failed at line 42',
    }

    expect(failure.failed).toBe(true)
    expect(failure.runId).toBe('123456789')
    expect(failure.workflowName).toBe('Build and Test')
    expect(failure.failedJobs).toHaveLength(2)
    expect(failure.logs).toContain('line 42')
  })

  test('failure with empty failedJobs', () => {
    const failure: CIFailure = {
      failed: true,
      runId: '123',
      failedJobs: [],
    }

    expect(failure.failedJobs).toHaveLength(0)
  })
})

describe('OnCIFailure component', () => {
  test('exports OnCIFailure function', async () => {
    const { OnCIFailure } = await import('./OnCIFailure')
    expect(typeof OnCIFailure).toBe('function')
  })

  test('OnCIFailure is a valid Solid component', async () => {
    const { OnCIFailure } = await import('./OnCIFailure')
    expect(OnCIFailure.length).toBeLessThanOrEqual(1)
  })
})
