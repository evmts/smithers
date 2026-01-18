/**
 * Unit tests for JJ/Describe.tsx - JJ describe component interface tests.
 */
import { describe, test, expect } from 'bun:test'
import type { DescribeProps } from './Describe.js'

describe('DescribeProps interface', () => {
  test('useAgent is optional', () => {
    const props: DescribeProps = {}
    expect(props.useAgent).toBeUndefined()
  })

  test('useAgent can be claude', () => {
    const props: DescribeProps = { useAgent: 'claude' }
    expect(props.useAgent).toBe('claude')
  })

  test('template is optional string', () => {
    const props: DescribeProps = { template: 'feat: {summary}' }
    expect(props.template).toBe('feat: {summary}')
  })

  test('children is optional', () => {
    const props: DescribeProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: DescribeProps = {
      useAgent: 'claude',
      template: 'conventional-commits',
    }

    expect(props.useAgent).toBe('claude')
    expect(props.template).toBe('conventional-commits')
  })
})

// Note: Component rendering tests require React reconciler test environment setup.
// The interface tests above verify the prop types work correctly.
