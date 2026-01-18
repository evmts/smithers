/**
 * Unit tests for JJ/Snapshot.tsx - JJ snapshot component interface tests.
 */
import { describe, test, expect } from 'bun:test'
import type { SnapshotProps } from './Snapshot'

describe('SnapshotProps interface', () => {
  test('message is optional', () => {
    const props: SnapshotProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: SnapshotProps = { message: 'Snapshot before refactoring' }
    expect(props.message).toBe('Snapshot before refactoring')
  })

  test('children is optional', () => {
    const props: SnapshotProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: SnapshotProps = {
      message: 'Pre-deploy snapshot',
    }

    expect(props.message).toBe('Pre-deploy snapshot')
  })
})

describe('Snapshot component', () => {
  test('exports Snapshot function', async () => {
    const { Snapshot } = await import('./Snapshot')
    expect(typeof Snapshot).toBe('function')
  })

  test('Snapshot is a valid Solid component', async () => {
    const { Snapshot } = await import('./Snapshot')
    expect(Snapshot.length).toBeLessThanOrEqual(1)
  })
})
