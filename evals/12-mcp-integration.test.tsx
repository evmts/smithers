/**
 * Eval 12: MCP Integration
 *
 * Tests MCP tool integration components for XML rendering.
 * Validates Sqlite component, config structure, and integration with Claude context.
 * Does NOT test actual MCP server execution - only XML output.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Claude } from '../src/components/Claude'
import { Sqlite } from '../src/components/MCP/Sqlite'
import { validateXML } from './validation/output-validator'

describe('12-mcp-integration', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('mcp-integration')
  })

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Sqlite component renders with path prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./data.db">
            Database has users table with id, name, email columns.
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('config=')
    expect(xml).toContain('Database has users table')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Sqlite component renders with readOnly prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="query">
          <Sqlite path="/var/db/production.db" readOnly={true}>
            Read-only access to production database.
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('config=')
    expect(xml).toContain('production.db')
    expect(xml).toContain('Read-only access')

    // Config should contain readOnly flag (JSON stringified)
    const configMatch = xml.match(/config="([^"]+)"/)
    if (configMatch) {
      const configJson = configMatch[1].replace(/&quot;/g, '"')
      const config = JSON.parse(configJson)
      expect(config.readOnly).toBe(true)
      expect(config.path).toBe('/var/db/production.db')
    }

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-readonly',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        readonly_config: true,
      },
      errors: [],
    })
  })

  test('MCP config structure in XML', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="analyze">
          <Sqlite path="./analytics.db">
            Contains events table (timestamp, user_id, action).
            Contains metrics table (name, value, date).
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify XML structure
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('</mcp-tool>')
    expect(xml).toContain('type="sqlite"')

    // Extract and validate config JSON
    const configMatch = xml.match(/config="([^"]+)"/)
    expect(configMatch).toBeTruthy()

    if (configMatch) {
      const configJson = configMatch[1].replace(/&quot;/g, '"')
      const config = JSON.parse(configJson)
      expect(config.path).toBe('./analytics.db')
      expect(config.readOnly).toBe(false)
    }

    // Verify instructions are preserved
    expect(xml).toContain('events table')
    expect(xml).toContain('metrics table')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-config-structure',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        config_parsed: true,
      },
      errors: [],
    })
  })

  test('Multiple MCP tools render correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-db">
          <Sqlite path="./users.db">
            Users database with profiles table.
          </Sqlite>
          <Sqlite path="./orders.db" readOnly={true}>
            Orders database with transactions table.
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Count mcp-tool elements
    const toolMatches = xml.match(/<mcp-tool/g)
    expect(toolMatches).toBeTruthy()
    expect(toolMatches?.length).toBe(2)

    // Verify both databases are present
    expect(xml).toContain('users.db')
    expect(xml).toContain('orders.db')
    expect(xml).toContain('profiles table')
    expect(xml).toContain('transactions table')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-multiple-mcp-tools',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        tool_count: toolMatches?.length ?? 0,
      },
      errors: [],
    })
  })

  test('MCP tool inside Claude context', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="agent-with-db">
          <Claude model="sonnet">
            <Sqlite path="./app.db">
              Application database with users, posts, comments tables.
            </Sqlite>
            Query all users who posted in the last week.
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify Claude element contains MCP tool
    expect(xml).toContain('<claude')
    expect(xml).toContain('model="sonnet"')
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('app.db')

    // Verify prompt text is preserved
    expect(xml).toContain('Query all users')
    expect(xml).toContain('last week')

    // Verify nesting structure: claude contains mcp-tool
    const claudeStartIdx = xml.indexOf('<claude')
    const mcpToolIdx = xml.indexOf('<mcp-tool')
    const claudeEndIdx = xml.indexOf('</claude>')

    expect(claudeStartIdx).toBeLessThan(mcpToolIdx)
    expect(mcpToolIdx).toBeLessThan(claudeEndIdx)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-inside-claude',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        correct_nesting: true,
      },
      errors: [],
    })
  })

  // ============================================================================
  // Sqlite MCP tool tests - XML rendering validation
  // ============================================================================

  test('Sqlite with absolute path', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="/var/data/myapp.db">
            Database at absolute path
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('/var/data/myapp.db')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-absolute-path',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Sqlite with relative path', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./data/local.db">
            Database at relative path
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('./data/local.db')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-relative-path',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Sqlite with in-memory database (:memory:)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path=":memory:">
            In-memory SQLite database for temporary operations
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain(':memory:')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-in-memory',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Sqlite readOnly=true config', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./readonly.db" readOnly={true}>
            Read-only database access
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')

    // Verify config contains readOnly: true
    const configMatch = xml.match(/config="([^"]+)"/)
    expect(configMatch).toBeTruthy()
    if (configMatch) {
      const configJson = configMatch[1].replace(/&quot;/g, '"')
      const config = JSON.parse(configJson)
      expect(config.readOnly).toBe(true)
    }

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-readonly-true',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, readOnly: true },
      errors: [],
    })
  })

  test('Sqlite readOnly=false config', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./readwrite.db" readOnly={false}>
            Read-write database access
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')

    // Verify config contains readOnly: false
    const configMatch = xml.match(/config="([^"]+)"/)
    expect(configMatch).toBeTruthy()
    if (configMatch) {
      const configJson = configMatch[1].replace(/&quot;/g, '"')
      const config = JSON.parse(configJson)
      expect(config.readOnly).toBe(false)
    }

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-readonly-false',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, readOnly: false },
      errors: [],
    })
  })

  test('Sqlite without children (minimal)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./minimal.db" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('./minimal.db')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-minimal',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Sqlite with schema description', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="data">
          <Sqlite path="./schema.db">
            Tables:
            - users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)
            - posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, body TEXT)
            - comments (id INTEGER PRIMARY KEY, post_id INTEGER, author TEXT, content TEXT)

            Foreign keys:
            - posts.user_id references users.id
            - comments.post_id references posts.id
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('users')
    expect(xml).toContain('posts')
    expect(xml).toContain('comments')
    expect(xml).toContain('PRIMARY KEY')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-schema-description',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // MCP tool integration tests - XML rendering validation
  // ============================================================================

  test('Multiple MCP tools same Claude context', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-tool">
          <Claude model="sonnet">
            <Sqlite path="./users.db">Users database</Sqlite>
            <Sqlite path="./products.db" readOnly={true}>Products database</Sqlite>
            <Sqlite path="./orders.db">Orders database</Sqlite>
            Join data from all three databases
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    const toolCount = (xml.match(/<mcp-tool/g) || []).length
    expect(toolCount).toBe(3)

    expect(xml).toContain('users.db')
    expect(xml).toContain('products.db')
    expect(xml).toContain('orders.db')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-multiple-mcp-tools-claude',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, tool_count: toolCount },
      errors: [],
    })
  })

  test('MCP tool in nested Phase structure', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="outer">
          <Phase name="inner">
            <Sqlite path="./nested.db">
              Database in nested phase
            </Sqlite>
          </Phase>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<phase name="outer"')
    expect(xml).toContain('<phase name="inner"')
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-nested-phase',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('MCP Sqlite with Claude and prompt text', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="query-task">
          <Claude model="opus">
            <Sqlite path="./analytics.db" readOnly={true}>
              Analytics database with events table:
              - timestamp: datetime
              - event_type: text
              - user_id: text
              - metadata: json
            </Sqlite>

            Query the top 10 most frequent event types in the last 24 hours.
            Format results as a markdown table.
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('model="opus"')
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('analytics.db')
    expect(xml).toContain('top 10 most frequent')
    expect(xml).toContain('markdown table')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-claude-prompt',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('MCP tool renders config JSON correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="config-test">
          <Sqlite path="./config-test.db" readOnly={true}>
            Test config serialization
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Extract and parse config
    const configMatch = xml.match(/config="([^"]+)"/)
    expect(configMatch).toBeTruthy()

    if (configMatch) {
      const configJson = configMatch[1].replace(/&quot;/g, '"')
      const config = JSON.parse(configJson)

      expect(config).toHaveProperty('path')
      expect(config).toHaveProperty('readOnly')
      expect(config.path).toBe('./config-test.db')
      expect(config.readOnly).toBe(true)
    }

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-config-json',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, config_parsed: true },
      errors: [],
    })
  })

  test('MCP mock mode renders correctly', async () => {
    const startTime = Date.now()

    // Mock mode is enabled by default in test env
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="mock-test">
          <Sqlite path="./mock.db">
            Mock mode test
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-mcp-mock-mode',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple Sqlite in different Phases', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="read-phase">
          <Sqlite path="./source.db" readOnly={true}>
            Source database for reading
          </Sqlite>
        </Phase>
        <Phase name="write-phase">
          <Sqlite path="./target.db" readOnly={false}>
            Target database for writing
          </Sqlite>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<phase name="read-phase"')
    expect(xml).toContain('<phase name="write-phase"')

    const toolCount = (xml.match(/<mcp-tool/g) || []).length
    expect(toolCount).toBe(2)

    expect(xml).toContain('source.db')
    expect(xml).toContain('target.db')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '12-sqlite-multiple-phases',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, tool_count: toolCount },
      errors: [],
    })
  })
})
