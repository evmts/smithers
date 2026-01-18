import { test, expect, describe } from 'bun:test'
import { StepRegistryProvider, type StepRegistryProviderProps } from './Step.js'

describe('StepRegistryProvider', () => {
  describe('Exports', () => {
    test('exports StepRegistryProvider', () => {
      expect(StepRegistryProvider).toBeDefined()
      expect(typeof StepRegistryProvider).toBe('function')
    })
  })

  describe('StepRegistryProviderProps interface', () => {
    test('accepts children prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
      }
      expect(props.children).toBeNull()
    })

    test('accepts optional phaseId prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
        phaseId: 'phase-1',
      }
      expect(props.phaseId).toBe('phase-1')
    })

    test('accepts optional isParallel prop', () => {
      const props: StepRegistryProviderProps = {
        children: null,
        isParallel: true,
      }
      expect(props.isParallel).toBe(true)
    })
  })
})

describe('Index exports', () => {
  test('exports StepRegistryProvider from index', async () => {
    const index = await import('./index.js')
    expect(index.StepRegistryProvider).toBeDefined()
  })
})
