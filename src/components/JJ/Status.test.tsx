/**
 * Unit tests for JJ/Status.tsx - JJ status component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { StatusProps } from './Status'

describe('StatusProps interface', () => {
  test('onDirty is optional callback', () => {
    const callback = mock(() => {})
    const props: StatusProps = { onDirty: callback }

    const status = {
      modified: ['file1.ts'],
      added: ['file2.ts'],
      deleted: [],
    }

    props.onDirty?.(status)
    expect(callback).toHaveBeenCalledWith(status)
  })

  test('onClean is optional callback', () => {
    const callback = mock(() => {})
    const props: StatusProps = { onClean: callback }

    props.onClean?.()
    expect(callback).toHaveBeenCalled()
  })

  test('children is optional', () => {
    const props: StatusProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const onDirty = mock(() => {})
    const onClean = mock(() => {})

    const props: StatusProps = { onDirty, onClean }

    expect(props.onDirty).toBeDefined()
    expect(props.onClean).toBeDefined()
  })
})

describe('Status component', () => {
  test('exports Status function', async () => {
    const { Status } = await import('./Status')
    expect(typeof Status).toBe('function')
  })

  test('Status is a valid Solid component', async () => {
    const { Status } = await import('./Status')
    expect(Status.length).toBeLessThanOrEqual(1)
  })
})
