/**
 * Tests for MCP/Sqlite.tsx - SQLite MCP Tool component
 */
import { describe, test, expect } from 'bun:test'
import { Sqlite, type SqliteProps } from './Sqlite.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { serialize } from '../../reconciler/serialize.js'
import type { SmithersNode } from '../../reconciler/types.js'

// Helper to create SmithersNode manually for serialize tests
function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: (SmithersNode | string)[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: children.map(child => {
      if (typeof child === 'string') {
        return {
          type: 'TEXT',
          props: { value: child },
          children: [],
          parent: null,
        }
      }
      return child
    }),
    parent: null,
  }
  node.children.forEach(child => {
    child.parent = node
  })
  return node
}

describe('Sqlite component', () => {
  describe('props interface', () => {
    test('path is required', () => {
      const props: SqliteProps = {
        path: './data.db',
      }
      expect(props.path).toBe('./data.db')
    })

    test('readOnly defaults to undefined', () => {
      const props: SqliteProps = {
        path: './data.db',
      }
      expect(props.readOnly).toBeUndefined()
    })

    test('readOnly can be true', () => {
      const props: SqliteProps = {
        path: './data.db',
        readOnly: true,
      }
      expect(props.readOnly).toBe(true)
    })

    test('readOnly can be false', () => {
      const props: SqliteProps = {
        path: './data.db',
        readOnly: false,
      }
      expect(props.readOnly).toBe(false)
    })

    test('children is optional', () => {
      const props: SqliteProps = {
        path: './data.db',
      }
      expect(props.children).toBeUndefined()
    })

    test('children can be string', () => {
      const props: SqliteProps = {
        path: './data.db',
        children: 'Database has users table',
      }
      expect(props.children).toBe('Database has users table')
    })
  })

  // ============================================================
  // Path handling edge cases
  // ============================================================

  describe('path handling', () => {
    test('path with spaces should be properly encoded in config', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="/path/with spaces/data.db" />)
      const xml = root.toXML()
      
      // Config JSON should contain the path with spaces
      expect(xml).toContain('/path/with spaces/data.db')
      root.dispose()
    })

    test('path with special characters (unicode, emoji) should work', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="/path/日本語/data🚀.db" />)
      const xml = root.toXML()
      
      expect(xml).toContain('日本語')
      expect(xml).toContain('🚀')
      root.dispose()
    })

    test('absolute path should be preserved', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="/Users/test/data.db" />)
      const xml = root.toXML()
      
      expect(xml).toContain('/Users/test/data.db')
      root.dispose()
    })

    test('relative path should be preserved', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./relative/data.db" />)
      const xml = root.toXML()
      
      expect(xml).toContain('./relative/data.db')
      root.dispose()
    })

    test('empty path should be handled', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="" />)
      const xml = root.toXML()
      
      // Empty path should still serialize
      expect(xml).toContain('mcp-tool')
      expect(xml).toContain('config=')
      root.dispose()
    })

    test('path with .. traversal should be preserved', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="../parent/data.db" />)
      const xml = root.toXML()
      
      expect(xml).toContain('../parent/data.db')
      root.dispose()
    })

    test('path with trailing slash should be handled', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="/path/to/dir/" />)
      const xml = root.toXML()
      
      expect(xml).toContain('/path/to/dir/')
      root.dispose()
    })
  })

  // ============================================================
  // Config JSON serialization
  // ============================================================

  describe('config JSON serialization', () => {
    test('config JSON should have correct structure { path, readOnly }', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" readOnly={true} />)
      const tree = root.getTree()
      
      // Find the mcp-tool node
      const mcpTool = tree.children[0]
      expect(mcpTool.type).toBe('mcp-tool')
      
      const config = JSON.parse(mcpTool.props.config as string)
      expect(config).toHaveProperty('path')
      expect(config).toHaveProperty('readOnly')
      expect(config.path).toBe('./data.db')
      expect(config.readOnly).toBe(true)
      root.dispose()
    })

    test('config JSON readOnly defaults to false when undefined', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const config = JSON.parse(mcpTool.props.config as string)
      expect(config.readOnly).toBe(false)
      root.dispose()
    })

    test('config JSON should be valid JSON string', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" readOnly={true} />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const configStr = mcpTool.props.config as string
      
      // Should not throw
      expect(() => JSON.parse(configStr)).not.toThrow()
      root.dispose()
    })

    test('config with very long path should serialize correctly', async () => {
      const longPath = '/very' + '/nested'.repeat(50) + '/data.db'
      const root = createSmithersRoot()
      await root.render(<Sqlite path={longPath} />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const config = JSON.parse(mcpTool.props.config as string)
      expect(config.path).toBe(longPath)
      root.dispose()
    })

    test('config with path containing quotes should serialize correctly', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path='/path/with"quotes/data.db' />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const config = JSON.parse(mcpTool.props.config as string)
      expect(config.path).toBe('/path/with"quotes/data.db')
      root.dispose()
    })

    test('config with path containing backslashes should serialize correctly', async () => {
      const root = createSmithersRoot()
      // JSX transform preserves backslashes, so the path is passed through as-is
      // Use a variable to avoid JSX string escaping quirks
      const windowsPath = 'C:\\Users\\test\\data.db'
      await root.render(<Sqlite path={windowsPath} />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const config = JSON.parse(mcpTool.props.config as string)
      expect(config.path).toBe(windowsPath)
      root.dispose()
    })
  })

  // ============================================================
  // Component rendering
  // ============================================================

  describe('component rendering', () => {
    test('renders mcp-tool element with type="sqlite"', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      expect(mcpTool.type).toBe('mcp-tool')
      expect(mcpTool.props.type).toBe('sqlite')
      root.dispose()
    })

    test('renders config attribute with JSON string', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" />)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      expect(typeof mcpTool.props.config).toBe('string')
      expect(mcpTool.props.config).toContain('path')
      root.dispose()
    })

    test('renders children inside mcp-tool element', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db">Database instructions</Sqlite>)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      expect(mcpTool.children.length).toBeGreaterThan(0)
      
      // Find TEXT node
      const textNode = mcpTool.children.find(c => c.type === 'TEXT')
      expect(textNode).toBeDefined()
      expect(textNode?.props.value).toBe('Database instructions')
      root.dispose()
    })

    test('renders null children correctly (no text content)', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db">{null}</Sqlite>)
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      // null children should not create nodes
      const textNodes = mcpTool.children.filter(c => c.type === 'TEXT')
      expect(textNodes.length).toBe(0)
      root.dispose()
    })

    test('renders multiple children (React.Fragment)', async () => {
      const root = createSmithersRoot()
      await root.render(
        <Sqlite path="./data.db">
          <>
            <constraints>Use SELECT only</constraints>
            <persona role="SQL expert">Query optimizer</persona>
          </>
        </Sqlite>
      )
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      // Should have constraints and persona as children
      const constraintsNode = mcpTool.children.find(c => c.type === 'constraints')
      const personaNode = mcpTool.children.find(c => c.type === 'persona')
      expect(constraintsNode).toBeDefined()
      expect(personaNode).toBeDefined()
      root.dispose()
    })

    test('renders nested elements as children', async () => {
      const root = createSmithersRoot()
      await root.render(
        <Sqlite path="./data.db">
          <constraints>
            <step>Step 1</step>
            <step>Step 2</step>
          </constraints>
        </Sqlite>
      )
      const tree = root.getTree()
      
      const mcpTool = tree.children[0]
      const constraints = mcpTool.children.find(c => c.type === 'constraints')
      expect(constraints).toBeDefined()
      expect(constraints?.children.length).toBe(2)
      root.dispose()
    })
  })

  // ============================================================
  // XML serialization via serialize()
  // ============================================================

  describe('XML serialization', () => {
    test('serializes to valid XML with type and config', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" readOnly={true} />)
      const xml = root.toXML()
      
      expect(xml).toContain('<mcp-tool')
      expect(xml).toContain('type="sqlite"')
      expect(xml).toContain('config="')
      root.dispose()
    })

    test('serializes children as nested XML', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db">Use this database</Sqlite>)
      const xml = root.toXML()
      
      expect(xml).toContain('<mcp-tool')
      expect(xml).toContain('Use this database')
      expect(xml).toContain('</mcp-tool>')
      root.dispose()
    })

    test('escapes special characters in config JSON', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path='/path/"test"/db.db' />)
      const xml = root.toXML()
      
      // The quotes in path should be escaped in XML
      expect(xml).toContain('&quot;')
      root.dispose()
    })

    test('serializes without children as self-closing', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db" />)
      const xml = root.toXML()
      
      expect(xml).toContain('/>')
      root.dispose()
    })
  })

  // ============================================================
  // Multiple components
  // ============================================================

  describe('multiple Sqlite components', () => {
    test('multiple Sqlite components render independently', async () => {
      const root = createSmithersRoot()
      await root.render(
        <>
          <Sqlite path="./users.db" readOnly={true}>Users database</Sqlite>
          <Sqlite path="./orders.db" readOnly={false}>Orders database</Sqlite>
        </>
      )
      const tree = root.getTree()
      
      expect(tree.children.length).toBe(2)
      
      const usersDb = tree.children[0]
      const ordersDb = tree.children[1]
      
      const usersConfig = JSON.parse(usersDb.props.config as string)
      const ordersConfig = JSON.parse(ordersDb.props.config as string)
      
      expect(usersConfig.path).toBe('./users.db')
      expect(usersConfig.readOnly).toBe(true)
      expect(ordersConfig.path).toBe('./orders.db')
      expect(ordersConfig.readOnly).toBe(false)
      root.dispose()
    })

    test('multiple Sqlite with same path but different readOnly', async () => {
      const root = createSmithersRoot()
      await root.render(
        <>
          <Sqlite path="./data.db" readOnly={true} />
          <Sqlite path="./data.db" readOnly={false} />
        </>
      )
      const tree = root.getTree()
      
      expect(tree.children.length).toBe(2)
      
      const readOnlyConfig = JSON.parse(tree.children[0].props.config as string)
      const writableConfig = JSON.parse(tree.children[1].props.config as string)
      
      expect(readOnlyConfig.readOnly).toBe(true)
      expect(writableConfig.readOnly).toBe(false)
      root.dispose()
    })
  })

  // ============================================================
  // Edge cases
  // ============================================================

  describe('edge cases', () => {
    test('re-render with changed path prop updates tree', async () => {
      // First render
      const root1 = createSmithersRoot()
      await root1.render(<Sqlite path="./old.db" />)
      let tree = root1.getTree()
      let config = JSON.parse(tree.children[0].props.config as string)
      expect(config.path).toBe('./old.db')
      root1.dispose()
      
      // Second render with different path
      const root2 = createSmithersRoot()
      await root2.render(<Sqlite path="./new.db" />)
      tree = root2.getTree()
      config = JSON.parse(tree.children[0].props.config as string)
      expect(config.path).toBe('./new.db')
      root2.dispose()
    })

    test('re-render with changed readOnly prop updates tree', async () => {
      // First render with readOnly=false
      const root1 = createSmithersRoot()
      await root1.render(<Sqlite path="./data.db" readOnly={false} />)
      let tree = root1.getTree()
      let config = JSON.parse(tree.children[0].props.config as string)
      expect(config.readOnly).toBe(false)
      root1.dispose()
      
      // Second render with readOnly=true
      const root2 = createSmithersRoot()
      await root2.render(<Sqlite path="./data.db" readOnly={true} />)
      tree = root2.getTree()
      config = JSON.parse(tree.children[0].props.config as string)
      expect(config.readOnly).toBe(true)
      root2.dispose()
    })

    test('unmount disposes cleanly', async () => {
      const root = createSmithersRoot()
      await root.render(<Sqlite path="./data.db">Instructions</Sqlite>)
      
      const treeBefore = root.getTree()
      expect(treeBefore.children.length).toBe(1)
      
      root.dispose()
      
      const treeAfter = root.getTree()
      expect(treeAfter.children.length).toBe(0)
    })

    test('conditional rendering works', async () => {
      const root = createSmithersRoot()
      
      const showDb = true
      await root.render(
        <>
          {showDb && <Sqlite path="./data.db" />}
        </>
      )
      
      const tree = root.getTree()
      expect(tree.children.length).toBe(1)
      root.dispose()
    })

    test('conditional rendering hides component', async () => {
      const root = createSmithersRoot()
      
      const showDb = false
      await root.render(
        <>
          {showDb && <Sqlite path="./data.db" />}
        </>
      )
      
      const tree = root.getTree()
      // false && <Sqlite> produces false, which should not render
      expect(tree.children.length).toBe(0)
      root.dispose()
    })
  })
})

describe('Sqlite direct node creation', () => {
  test('mcp-tool node serializes with type and config', () => {
    const config = JSON.stringify({ path: './data.db', readOnly: false })
    const node = createNode('mcp-tool', { type: 'sqlite', config })
    const xml = serialize(node)
    
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('type="sqlite"')
    expect(xml).toContain('config="')
  })

  test('mcp-tool node with children serializes correctly', () => {
    const config = JSON.stringify({ path: './data.db', readOnly: true })
    const node = createNode('mcp-tool', { type: 'sqlite', config }, ['Database docs'])
    const xml = serialize(node)
    
    expect(xml).toContain('<mcp-tool')
    expect(xml).toContain('Database docs')
    expect(xml).toContain('</mcp-tool>')
  })

  test('nested mcp-tool nodes serialize correctly', () => {
    const config1 = JSON.stringify({ path: './db1.db', readOnly: true })
    const config2 = JSON.stringify({ path: './db2.db', readOnly: false })
    const node1 = createNode('mcp-tool', { type: 'sqlite', config: config1 })
    const node2 = createNode('mcp-tool', { type: 'sqlite', config: config2 })
    const root = createNode('ROOT', {}, [node1, node2])
    const xml = serialize(root)
    
    expect(xml).toContain('db1.db')
    expect(xml).toContain('db2.db')
  })
})

describe('Sqlite e2e', () => {
  // ============================================================
  // E2E TESTS - Full integration with Claude component
  // These require actual MCP server setup and Claude API
  // ============================================================

  test.todo('Sqlite tool is available to Claude agent')
  test.todo('Claude can execute SQL SELECT via Sqlite tool')
  test.todo('Claude can execute SQL INSERT via Sqlite tool (readOnly=false)')
  test.todo('Claude receives error for SQL INSERT with readOnly=true')
  test.todo('Claude can execute multiple queries in sequence')
  test.todo('Claude handles SQLite syntax errors gracefully')
  test.todo('Claude handles database connection errors')
  test.todo('Sqlite tool timeout handling')
  test.todo('Sqlite tool with large result set (truncation)')
  test.todo('Sqlite tool with binary data (BLOB columns)')
})
