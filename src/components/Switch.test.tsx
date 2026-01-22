import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from './SmithersProvider.js'
import { Switch, Case, Default, type SwitchProps, type CaseProps, type DefaultProps } from './Switch.js'

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('Switch Exports', () => {
  test('exports Switch component', () => {
    expect(Switch).toBeDefined()
    expect(typeof Switch).toBe('function')
  })

  test('exports Case component', () => {
    expect(Case).toBeDefined()
    expect(typeof Case).toBe('function')
  })

  test('exports Default component', () => {
    expect(Default).toBeDefined()
    expect(typeof Default).toBe('function')
  })
})

// ============================================================================
// SWITCH BASIC RENDERING
// ============================================================================

describe('Switch basic rendering', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-switch', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('renders matching Case child', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="foo">
          <Case match="foo">
            <matched>foo content</matched>
          </Case>
          <Case match="bar">
            <matched>bar content</matched>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('foo content')
    expect(xml).not.toContain('bar content')
  })

  test('renders second Case when value matches', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="bar">
          <Case match="foo">
            <matched>foo content</matched>
          </Case>
          <Case match="bar">
            <matched>bar content</matched>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).not.toContain('foo content')
    expect(xml).toContain('bar content')
  })

  test('renders Default when no Case matches', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="unknown">
          <Case match="foo">
            <matched>foo content</matched>
          </Case>
          <Case match="bar">
            <matched>bar content</matched>
          </Case>
          <Default>
            <fallback>default content</fallback>
          </Default>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).not.toContain('foo content')
    expect(xml).not.toContain('bar content')
    expect(xml).toContain('default content')
  })

  test('renders nothing when no Case matches and no Default', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="unknown">
          <Case match="foo">
            <matched>foo content</matched>
          </Case>
          <Case match="bar">
            <matched>bar content</matched>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).not.toContain('foo content')
    expect(xml).not.toContain('bar content')
  })
})

// ============================================================================
// SWITCH WITH ARRAY MATCH
// ============================================================================

describe('Switch with array match', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-switch-array', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('matches when value is in array', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="high">
          <Case match={['critical', 'high']}>
            <priority>urgent</priority>
          </Case>
          <Case match={['low', 'trivial']}>
            <priority>batch</priority>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('urgent')
    expect(xml).not.toContain('batch')
  })

  test('matches second case with array', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="trivial">
          <Case match={['critical', 'high']}>
            <priority>urgent</priority>
          </Case>
          <Case match={['low', 'trivial']}>
            <priority>batch</priority>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).not.toContain('urgent')
    expect(xml).toContain('batch')
  })
})

// ============================================================================
// SWITCH WITH FUNCTION VALUE
// ============================================================================

describe('Switch with function value', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-switch-fn', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('evaluates sync function value', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value={() => 'computed'}>
          <Case match="computed">
            <result>computed matched</result>
          </Case>
          <Default>
            <result>default</result>
          </Default>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('computed matched')
  })

  test('evaluates async function value', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value={async () => 'async-result'}>
          <Case match="async-result">
            <result>async matched</result>
          </Case>
          <Default>
            <result>default</result>
          </Default>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('async matched')
  })
})

// ============================================================================
// SWITCH WITH NUMBERS
// ============================================================================

describe('Switch with numeric values', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-switch-num', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('matches numeric value', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value={42}>
          <Case match={0}>
            <result>zero</result>
          </Case>
          <Case match={42}>
            <result>forty-two</result>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('forty-two')
    expect(xml).not.toContain('zero')
  })
})

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Switch edge cases', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-switch-edge', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  test('first matching Case wins when multiple could match', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value="x">
          <Case match="x">
            <result>first</result>
          </Case>
          <Case match="x">
            <result>second</result>
          </Case>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('first')
    expect(xml).not.toContain('second')
  })

  test('handles null value', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value={null}>
          <Case match={null}>
            <result>null matched</result>
          </Case>
          <Default>
            <result>default</result>
          </Default>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('null matched')
  })

  test('handles undefined value with Default', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Switch value={undefined}>
          <Case match="something">
            <result>something</result>
          </Case>
          <Default>
            <result>undefined goes to default</result>
          </Default>
        </Switch>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('undefined goes to default')
  })
})

// ============================================================================
// INDEX EXPORTS
// ============================================================================

describe('Switch index exports', () => {
  test('exports Switch from index', async () => {
    const index = await import('./index.js')
    expect(index.Switch).toBeDefined()
    expect(index.Case).toBeDefined()
    expect(index.Default).toBeDefined()
  })
})
