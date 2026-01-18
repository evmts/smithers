/**
 * Eval 07: Database Reactive Hooks
 *
 * Tests reactive database hooks (useQuery, useQueryOne, useQueryValue).
 * Validates that components using reactive database queries render without error
 * and produce expected XML output.
 *
 * Note: These tests focus on rendering and initial data, not reactive updates.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { useQuery, useQueryOne, useQueryValue } from '../src/reactive-sqlite'
import { DatabaseProvider } from '../src/reactive-sqlite/hooks/context'
import { validateXML } from './validation/output-validator'

describe('07-database-reactive', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('database-reactive')

    // Create test table and insert sample data
    env.db.db.exec(`
      CREATE TABLE IF NOT EXISTS test_users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER
      )
    `)

    env.db.db.exec(`
      INSERT INTO test_users (name, age) VALUES
        ('Alice', 30),
        ('Bob', 25),
        ('Charlie', 35)
    `)
  })

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('useQuery hook renders without error', async () => {
    const startTime = Date.now()

    function TestComponent() {
      const { data } = useQuery(env.db.db, 'SELECT * FROM test_users', [])
      return <results count={data?.length ?? 0} />
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <TestComponent />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<results')
    expect(xml).toContain('count=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-usequery-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('useQueryOne renders without error', async () => {
    const startTime = Date.now()

    function TestComponent() {
      const { data } = useQueryOne(env.db.db, 'SELECT * FROM test_users WHERE name = ?', ['Alice'])
      return <user name={data?.name ?? 'none'} />
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <TestComponent />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<user')
    expect(xml).toContain('name=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-usequeryone-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('useQueryValue renders without error', async () => {
    const startTime = Date.now()

    function TestComponent() {
      const { data: count } = useQueryValue(env.db.db, 'SELECT COUNT(*) as count FROM test_users', [])
      return <stats total={count ?? 0} />
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <TestComponent />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<stats')
    expect(xml).toContain('total=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-usequeryvalue-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Component with useQuery renders data', async () => {
    const startTime = Date.now()

    function UserList() {
      const { data } = useQuery<{ id: number; name: string; age: number }>(
        env.db.db,
        'SELECT * FROM test_users ORDER BY name',
        []
      )
      return (
        <users>
          {data?.map(user => (
            <user key={user.id} name={user.name} age={user.age} />
          )) ?? []}
        </users>
      )
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <UserList />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<users')
    expect(xml).toContain('name="Alice"')
    expect(xml).toContain('name="Bob"')
    expect(xml).toContain('name="Charlie"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-usequery-renders-data',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        contains_alice: xml.includes('Alice'),
        contains_bob: xml.includes('Bob'),
        contains_charlie: xml.includes('Charlie'),
      },
      errors: [],
    })
  })

  test('DatabaseProvider wraps components', async () => {
    const startTime = Date.now()

    function ChildComponent() {
      return <status active={true} />
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <ChildComponent />
      </DatabaseProvider>
    )

    const tree = env.root.getTree()
    const duration = Date.now() - startTime

    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.type).toBe('status')

    logEvalResult({
      test: '07-provider-wraps-components',
      passed: true,
      duration_ms: duration,
      structured_output: {
        has_child: tree.children.length > 0,
      },
      errors: [],
    })
  })

  test('Multiple components with same query render', async () => {
    const startTime = Date.now()

    function Counter1() {
      const { data } = useQuery(env.db.db, 'SELECT COUNT(*) as count FROM test_users', [])
      return <counter1 value={data?.[0]?.count ?? 0} />
    }

    function Counter2() {
      const { data } = useQuery(env.db.db, 'SELECT COUNT(*) as count FROM test_users', [])
      return <counter2 value={data?.[0]?.count ?? 0} />
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <Counter1 />
        <Counter2 />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<counter1')
    expect(xml).toContain('<counter2')
    expect(xml).toContain('value=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-multiple-same-query',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_counter1: xml.includes('counter1'),
        has_counter2: xml.includes('counter2'),
      },
      errors: [],
    })
  })

  test('Query with parameters works', async () => {
    const startTime = Date.now()

    function FilteredUsers() {
      const minAge = 30
      const { data } = useQuery<{ id: number; name: string; age: number }>(
        env.db.db,
        'SELECT * FROM test_users WHERE age >= ? ORDER BY age',
        [minAge]
      )
      return (
        <filtered minAge={minAge}>
          {data?.map(user => (
            <user key={user.id} name={user.name} age={user.age} />
          )) ?? []}
        </filtered>
      )
    }

    await env.root.render(
      <DatabaseProvider db={env.db.db}>
        <FilteredUsers />
      </DatabaseProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<filtered')
    expect(xml).toContain('minAge="30"')
    expect(xml).toContain('name="Alice"')
    expect(xml).toContain('name="Charlie"')
    expect(xml).not.toContain('name="Bob"') // Bob is 25, filtered out

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '07-query-with-parameters',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        filtered_correctly: !xml.includes('Bob'),
        has_alice: xml.includes('Alice'),
        has_charlie: xml.includes('Charlie'),
      },
      errors: [],
    })
  })
})
