import { test, expect, describe } from 'bun:test'
import { Parallel, type ParallelProps } from './Parallel.js'

describe('Parallel component', () => {
  describe('Exports', () => {
    test('exports Parallel component', () => {
      expect(Parallel).toBeDefined()
      expect(typeof Parallel).toBe('function')
    })
  })

  describe('ParallelProps interface', () => {
    test('accepts children prop', () => {
      const props: ParallelProps = {
        children: null,
      }
      expect(props.children).toBeNull()
    })
  })
})

describe('Index exports', () => {
  test('exports Parallel from index', async () => {
    const index = await import('./index.js')
    expect(index.Parallel).toBeDefined()
  })
})
