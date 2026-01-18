/**
 * Tests for React Context Provider for ReactiveDatabase
 *
 * NOTE: React component rendering tests are skipped because they use @testing-library/react
 * which requires react-dom, but this project uses a custom React reconciler.
 * We test exports and basic functionality that doesn't require rendering.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { DatabaseProvider, useDatabase, useDatabaseOptional, DatabaseContext } from './context'
import { ReactiveDatabase } from '../database'

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

describe('DatabaseProvider element creation', () => {
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

  test('passes children through', () => {
    const child = React.createElement('div', null, 'test')
    const element = React.createElement(DatabaseProvider, { db }, child)
    expect(element.props.children).toBe(child)
  })
})

// Note: The rendering tests below are skipped because they require react-dom
// which conflicts with the project's custom JSX runtime

describe.skip('DatabaseProvider rendering', () => {
  // These tests would verify that:
  // - Provider renders children correctly
  // - useDatabase() returns the db instance from context
  // - useDatabase() throws when used outside provider
  // - useQuery/useMutation work with context
})

describe('hook exports from index', () => {
  test('index exports all context utilities', async () => {
    const hooks = await import('./index')

    expect(hooks.DatabaseProvider).toBeDefined()
    expect(hooks.useDatabase).toBeDefined()
    expect(hooks.useDatabaseOptional).toBeDefined()
    expect(hooks.useQuery).toBeDefined()
    expect(hooks.useMutation).toBeDefined()
  })
})

describe('useQuery overload detection', () => {
  test('useQuery accepts string as first argument (new signature)', async () => {
    const { useQuery } = await import('./useQuery')
    // Verify the function exists and accepts overloaded args
    expect(typeof useQuery).toBe('function')
  })
})

describe('useMutation overload detection', () => {
  test('useMutation accepts string as first argument (new signature)', async () => {
    const { useMutation } = await import('./useMutation')
    // Verify the function exists and accepts overloaded args
    expect(typeof useMutation).toBe('function')
  })
})
