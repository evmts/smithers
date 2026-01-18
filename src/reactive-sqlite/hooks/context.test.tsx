/**
 * Tests for React Context Provider for ReactiveDatabase
 *
 * Tests validate:
 * 1. Module exports
 * 2. Hook functionality through SmithersRoot rendering
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { DatabaseProvider, useDatabase, useDatabaseOptional, DatabaseContext } from './context.js'
import { ReactiveDatabase } from '../database.js'
import { createSmithersRoot } from '../../reconciler/root.js'

describe('DatabaseContext exports', () => {
  test('DatabaseProvider is a function component', () => {
    expect(typeof DatabaseProvider).toBe('function')
    expect(DatabaseProvider.length).toBe(1) // Takes props object
  })

  test('useDatabase is a hook function', () => {
    expect(typeof useDatabase).toBe('function')
  })

  test('useDatabaseOptional is a hook function', () => {
    expect(typeof useDatabaseOptional).toBe('function')
  })

  test('DatabaseContext is a React Context', () => {
    expect(DatabaseContext).toBeDefined()
    expect(DatabaseContext.Provider).toBeDefined()
    expect(DatabaseContext.Consumer).toBeDefined()
  })
})

describe('DatabaseProvider rendering', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('creates valid React element with db prop', () => {
    const element = React.createElement(DatabaseProvider, { db }, null)
    expect(element.type).toBe(DatabaseProvider)
    expect(element.props.db).toBe(db)
  })

  test('renders through SmithersRoot', async () => {
    const root = createSmithersRoot()
    await root.render(
      <DatabaseProvider db={db}>
        <results count={0} />
      </DatabaseProvider>
    )

    const tree = root.getTree()
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.type).toBe('results')

    root.dispose()
  })
})

describe('useDatabase hook', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('returns database from context', async () => {
    let capturedDb: ReactiveDatabase | null = null

    function Consumer() {
      capturedDb = useDatabase()
      return <status connected={true} />
    }

    const root = createSmithersRoot()
    await root.render(
      <DatabaseProvider db={db}>
        <Consumer />
      </DatabaseProvider>
    )

    expect(capturedDb).toBe(db)
    root.dispose()
  })

  test('throws when used outside provider', async () => {
    let thrownError: Error | null = null

    function Consumer() {
      try {
        useDatabase()
      } catch (e) {
        thrownError = e as Error
      }
      return <status error={true} />
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    expect(thrownError).not.toBeNull()
    expect(thrownError!.message).toContain('DatabaseProvider')
    root.dispose()
  })
})

describe('useDatabaseOptional hook', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('returns database when inside provider', async () => {
    let capturedDb: ReactiveDatabase | null | undefined = undefined

    function Consumer() {
      capturedDb = useDatabaseOptional()
      return <status hasDb={capturedDb !== null} />
    }

    const root = createSmithersRoot()
    await root.render(
      <DatabaseProvider db={db}>
        <Consumer />
      </DatabaseProvider>
    )

    expect(capturedDb).toBe(db)
    root.dispose()
  })

  test('returns null when outside provider', async () => {
    let capturedDb: ReactiveDatabase | null | undefined = undefined

    function Consumer() {
      capturedDb = useDatabaseOptional()
      return <status hasDb={capturedDb !== null} />
    }

    const root = createSmithersRoot()
    await root.render(<Consumer />)

    expect(capturedDb).toBeNull()
    root.dispose()
  })
})

describe('hook exports from index', () => {
  test('index exports all context utilities', async () => {
    const hooks = await import('./index.js')

    expect(hooks.DatabaseProvider).toBeDefined()
    expect(hooks.useDatabase).toBeDefined()
    expect(hooks.useDatabaseOptional).toBeDefined()
    expect(hooks.useQuery).toBeDefined()
    expect(hooks.useMutation).toBeDefined()
  })
})

describe('useQuery/useMutation signatures', () => {
  test('useQuery accepts string as first argument', async () => {
    const { useQuery } = await import('./useQuery.js')
    expect(typeof useQuery).toBe('function')
  })

  test('useMutation accepts string as first argument', async () => {
    const { useMutation } = await import('./useMutation.js')
    expect(typeof useMutation).toBe('function')
  })
})
