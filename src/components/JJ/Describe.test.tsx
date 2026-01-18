/**
 * Unit tests for JJ/Describe.tsx - JJ describe component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { DescribeProps } from './Describe'

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

describe('Describe component', () => {
  test('exports Describe function', async () => {
    const { Describe } = await import('./Describe')
    expect(typeof Describe).toBe('function')
  })

  test('Describe is a valid Solid component', async () => {
    const { Describe } = await import('./Describe')
    expect(Describe.length).toBeLessThanOrEqual(1)
  })
})
