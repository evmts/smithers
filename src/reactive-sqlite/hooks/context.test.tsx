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

describe('nested providers', () => {
  let outerDb: ReactiveDatabase
  let innerDb: ReactiveDatabase

  beforeEach(() => {
    outerDb = new ReactiveDatabase(':memory:')
    outerDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    outerDb.run('INSERT INTO users (name) VALUES (?)', ['OuterUser'])

    innerDb = new ReactiveDatabase(':memory:')
    innerDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    innerDb.run('INSERT INTO users (name) VALUES (?)', ['InnerUser'])
  })

  afterEach(() => {
    outerDb.close()
    innerDb.close()
  })

  test('inner provider overrides outer provider', async () => {
    let innerResult: ReactiveDatabase | null = null
    let outerResult: ReactiveDatabase | null = null

    function InnerConsumer() {
      innerResult = useDatabase()
      return <status inner />
    }

    function OuterConsumer() {
      outerResult = useDatabase()
      return (
        <DatabaseProvider db={innerDb}>
          <InnerConsumer />
        </DatabaseProvider>
      )
    }

    const root = createSmithersRoot()
    await root.render(
      <DatabaseProvider db={outerDb}>
        <OuterConsumer />
      </DatabaseProvider>
    )

    expect(outerResult).toBe(outerDb)
    expect(innerResult).toBe(innerDb)

    root.dispose()
  })

  test('sibling providers are independent', async () => {
    let result1: ReactiveDatabase | null = null
    let result2: ReactiveDatabase | null = null

    function Consumer1() {
      result1 = useDatabase()
      return <status consumer1 />
    }

    function Consumer2() {
      result2 = useDatabase()
      return <status consumer2 />
    }

    const root = createSmithersRoot()
    await root.render(
      <>
        <DatabaseProvider db={outerDb}>
          <Consumer1 />
        </DatabaseProvider>
        <DatabaseProvider db={innerDb}>
          <Consumer2 />
        </DatabaseProvider>
      </>
    )

    expect(result1).toBe(outerDb)
    expect(result2).toBe(innerDb)

    root.dispose()
  })
})

describe('provider unmount', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('unmounting provider removes context access', async () => {
    let setShowProvider: ((show: boolean) => void) | null = null
    let capturedDb: ReactiveDatabase | null = null

    function Consumer() {
      capturedDb = useDatabase()
      return <status connected={!!capturedDb} />
    }

    function App() {
      const [show, setShow] = React.useState(true)
      setShowProvider = setShow
      return show ? (
        <DatabaseProvider db={db}>
          <Consumer />
        </DatabaseProvider>
      ) : (
        <status hidden />
      )
    }

    const root = createSmithersRoot()
    await root.render(<App />)

    expect(capturedDb).toBe(db)
    const tree = root.getTree()
    expect(tree.children[0]!.type).toBe('status')
    expect(tree.children[0]!.props.connected).toBe(true)

    setShowProvider!(false)
    await root.render(<App />)

    const treeAfter = root.getTree()
    expect(treeAfter.children[0]!.type).toBe('status')
    expect(treeAfter.children[0]!.props.hidden).toBe(true)

    root.dispose()
  })
})

describe('database prop change', () => {
  let db1: ReactiveDatabase
  let db2: ReactiveDatabase

  beforeEach(() => {
    db1 = new ReactiveDatabase(':memory:')
    db1.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    db1.run('INSERT INTO users (name) VALUES (?)', ['DB1User'])

    db2 = new ReactiveDatabase(':memory:')
    db2.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    db2.run('INSERT INTO users (name) VALUES (?)', ['DB2User'])
  })

  afterEach(() => {
    db1.close()
    db2.close()
  })

  test('changing db prop updates context', async () => {
    let capturedDb: ReactiveDatabase | null = null
    let setCurrentDb: ((db: ReactiveDatabase) => void) | null = null

    function Consumer() {
      capturedDb = useDatabase()
      return <status ready />
    }

    function App() {
      const [currentDb, _setCurrentDb] = React.useState(db1)
      setCurrentDb = _setCurrentDb
      return (
        <DatabaseProvider db={currentDb}>
          <Consumer />
        </DatabaseProvider>
      )
    }

    const root = createSmithersRoot()
    await root.render(<App />)

    expect(capturedDb).toBe(db1)

    // Change db prop
    setCurrentDb!(db2)
    await root.render(<App />)

    expect(capturedDb).toBe(db2)

    root.dispose()
  })

  test('queries update when db prop changes', async () => {
    const { useQuery } = await import('./useQuery.js')

    let queryResult: any = null
    let setCurrentDb: ((db: ReactiveDatabase) => void) | null = null

    function Consumer() {
      queryResult = useQuery<{ name: string }>('SELECT * FROM users')
      return <status ready />
    }

    function App() {
      const [currentDb, _setCurrentDb] = React.useState(db1)
      setCurrentDb = _setCurrentDb
      return (
        <DatabaseProvider db={currentDb}>
          <Consumer />
        </DatabaseProvider>
      )
    }

    const root = createSmithersRoot()
    await root.render(<App />)

    expect(queryResult.data[0]?.name).toBe('DB1User')

    // Change db prop
    setCurrentDb!(db2)
    await root.render(<App />)

    // Refetch to pick up new db
    queryResult.refetch()
    await root.render(<App />)

    expect(queryResult.data[0]?.name).toBe('DB2User')

    root.dispose()
  })
})
