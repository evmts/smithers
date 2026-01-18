/**
 * Tests for React Context Provider for ReactiveDatabase
 *
 * NOTE: These tests are skipped because they use @testing-library/react
 * which requires react-dom, but this project uses a custom React reconciler
 * with jsxImportSource: "smithers-orchestrator". The JSX transforms to
 * SmithersNodes instead of React elements that react-dom expects.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { DatabaseProvider, useDatabase } from './context'
import { ReactiveDatabase } from '../database'

describe.skip('DatabaseProvider', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('renders children', () => {
    render(
      <DatabaseProvider db={db}>
        <div data-testid="child">Hello</div>
      </DatabaseProvider>
    )

    expect(screen.getByTestId('child')).toBeDefined()
    expect(screen.getByTestId('child').textContent).toBe('Hello')
  })

  test('useDatabase() returns db instance from context', () => {
    let capturedDb: ReactiveDatabase | undefined

    function TestComponent() {
      capturedDb = useDatabase()
      return <div>Test</div>
    }

    render(
      <DatabaseProvider db={db}>
        <TestComponent />
      </DatabaseProvider>
    )

    expect(capturedDb).toBe(db)
  })

  test('useDatabase() throws when used outside provider', () => {
    function TestComponent() {
      useDatabase()
      return <div>Test</div>
    }

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useDatabase must be used within a DatabaseProvider')
  })
})

// Import the hooks that will be modified
import { useQuery } from './useQuery'
import { useMutation } from './useMutation'

describe.skip('useQuery with context', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
  })

  afterEach(() => {
    db.close()
  })

  test('useQuery without explicit db uses context', () => {
    let result: { data: any[] } | undefined

    function TestComponent() {
      result = useQuery('SELECT * FROM users')
      return <div>Test</div>
    }

    render(
      <DatabaseProvider db={db}>
        <TestComponent />
      </DatabaseProvider>
    )

    expect(result?.data).toHaveLength(1)
    expect(result?.data[0].name).toBe('Alice')
  })

  test('useQuery with explicit db ignores context', () => {
    const otherDb = new ReactiveDatabase(':memory:')
    otherDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    otherDb.run('INSERT INTO users (name) VALUES (?)', ['Bob'])

    let result: { data: any[] } | undefined

    function TestComponent() {
      // Pass explicit db - should use this instead of context
      result = useQuery('SELECT * FROM users', [], {}, otherDb)
      return <div>Test</div>
    }

    render(
      <DatabaseProvider db={db}>
        <TestComponent />
      </DatabaseProvider>
    )

    expect(result?.data).toHaveLength(1)
    expect(result?.data[0].name).toBe('Bob')

    otherDb.close()
  })
})

describe.skip('useMutation with context', () => {
  let db: ReactiveDatabase

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  })

  afterEach(() => {
    db.close()
  })

  test('useMutation without explicit db uses context', () => {
    let mutation: { mutate: (...args: any[]) => void } | undefined

    function TestComponent() {
      mutation = useMutation('INSERT INTO users (name) VALUES (?)')
      return <div>Test</div>
    }

    render(
      <DatabaseProvider db={db}>
        <TestComponent />
      </DatabaseProvider>
    )

    act(() => {
      mutation?.mutate('Charlie')
    })

    const users = db.query('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect((users[0] as any).name).toBe('Charlie')
  })

  test('useMutation with explicit db ignores context', () => {
    const otherDb = new ReactiveDatabase(':memory:')
    otherDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

    let mutation: { mutate: (...args: any[]) => void } | undefined

    function TestComponent() {
      // Pass explicit db - should use this instead of context
      mutation = useMutation('INSERT INTO users (name) VALUES (?)', {}, otherDb)
      return <div>Test</div>
    }

    render(
      <DatabaseProvider db={db}>
        <TestComponent />
      </DatabaseProvider>
    )

    act(() => {
      mutation?.mutate('David')
    })

    // Should be in otherDb, not in context db
    const usersInOther = otherDb.query('SELECT * FROM users')
    const usersInContext = db.query('SELECT * FROM users')

    expect(usersInOther).toHaveLength(1)
    expect((usersInOther[0] as any).name).toBe('David')
    expect(usersInContext).toHaveLength(0)

    otherDb.close()
  })
})
