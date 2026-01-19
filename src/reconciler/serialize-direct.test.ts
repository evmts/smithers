/**
 * Direct tests for serialize() function.
 *
 * CRITICAL: These tests create nodes MANUALLY (not with JSX) to control
 * input strings. If input already contains XML entities, serialization
 * will escape again and can mask bugs.
 *
 * This is the #1 gotcha in XML serialization testing!
 */

import { describe, it, expect } from 'bun:test'
import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'

describe('XML Serialization (Direct Node Creation)', () => {
  /**
   * GOTCHA #1: Entity Escaping
   * Create nodes MANUALLY with raw strings to avoid double-escape confusion.
   */
  it('should escape XML entities in text content', () => {
    // DON'T use JSX here - it will pre-escape!
    const node: SmithersNode = {
      type: 'claude',
      props: {},
      children: [{
        type: 'TEXT',
        props: { value: 'Test & "quotes" < > \' apostrophe' },  // Raw string
        children: [],
        parent: null,
      }],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('&amp;')   // & escaped
    expect(xml).toContain('&quot;')  // " escaped
    expect(xml).toContain('&lt;')    // < escaped
    expect(xml).toContain('&gt;')    // > escaped
    expect(xml).toContain('&apos;')  // ' escaped
  })

  it('should escape XML entities in prop values', () => {
    const node: SmithersNode = {
      type: 'task',
      props: {
        name: 'test & < > " \' special chars',
      },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;')
    expect(xml).toContain('&gt;')
    expect(xml).toContain('&quot;')
    expect(xml).toContain('&apos;')
  })

  /**
   * GOTCHA #2: Key Attribute Ordering
   * Key should appear FIRST in attribute list
   */
  it('should put key before other props', () => {
    const node: SmithersNode = {
      type: 'task',
      key: 'my-key',
      props: { name: 'test', count: 42 },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    // key should come first
    expect(xml).toMatch(/^<task key="my-key"/)
    expect(xml).toContain('name="test"')
    expect(xml).toContain('count="42"')
  })

  it('should handle numeric keys', () => {
    const node: SmithersNode = {
      type: 'task',
      key: 123,
      props: {},
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('key="123"')
  })

  /**
   * GOTCHA #3: Props Filtering
   * Callbacks and certain props must be excluded
   */
  it('should exclude callbacks and functions', () => {
    const node: SmithersNode = {
      type: 'task',
      props: {
        name: 'test',
        onFinished: () => {},
        onError: () => {},
        onStreamStart: () => {},
        onStreamDelta: () => {},
        onStreamEnd: () => {},
        validate: () => {},
        children: 'should-not-appear',
      },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
    expect(xml).not.toContain('onStreamStart')
    expect(xml).not.toContain('onStreamDelta')
    expect(xml).not.toContain('onStreamEnd')
    expect(xml).not.toContain('validate')
    expect(xml).not.toContain('children=')
  })

  it('should serialize object props as JSON', () => {
    const node: SmithersNode = {
      type: 'task',
      props: {
        config: { nested: { value: 42 } },
      },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('config=')
    expect(xml).toContain('nested')
    expect(xml).toContain('42')
    // Should be escaped JSON
    expect(xml).toContain('&quot;')
  })

  /**
   * ROOT node special handling
   */
  it('should serialize ROOT children without wrapper', () => {
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [
        { type: 'task', props: { name: 'first' }, children: [], parent: null },
        { type: 'task', props: { name: 'second' }, children: [], parent: null },
      ],
      parent: null,
    }

    const xml = serialize(root)

    expect(xml).not.toContain('<ROOT>')
    expect(xml).not.toContain('</ROOT>')

    const lines = xml.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('first')
    expect(lines[1]).toContain('second')
  })

  /**
   * Self-closing tags
   */
  it('should use self-closing tags for empty elements', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { name: 'test' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toBe('<task name="test" />')
    expect(xml).not.toContain('</task>')
  })

  it('should not use self-closing tags for elements with children', () => {
    const node: SmithersNode = {
      type: 'phase',
      props: {},
      children: [
        { type: 'task', props: {}, children: [], parent: null },
      ],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('<phase>')
    expect(xml).toContain('</phase>')
    expect(xml).not.toMatch(/<phase[^>]*\/>/)
  })

  /**
   * Indentation
   */
  it('should indent children by 2 spaces', () => {
    const node: SmithersNode = {
      type: 'phase',
      props: {},
      children: [
        { type: 'task', props: { name: 'nested' }, children: [], parent: null },
      ],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('  <task')  // 2 space indent
  })

  it('should indent nested children correctly', () => {
    const node: SmithersNode = {
      type: 'level1',
      props: {},
      children: [{
        type: 'level2',
        props: {},
        children: [{
          type: 'level3',
          props: {},
          children: [],
          parent: null,
        }],
        parent: null,
      }],
      parent: null,
    }

    const xml = serialize(node)

    // level2 should be indented 2 spaces
    expect(xml).toContain('  <level2>')
    // level3 should be indented 4 spaces
    expect(xml).toContain('    <level3')
  })

  /**
   * TEXT node handling
   */
  it('should serialize TEXT nodes directly', () => {
    const node: SmithersNode = {
      type: 'message',
      props: {},
      children: [{
        type: 'TEXT',
        props: { value: 'Hello World' },
        children: [],
        parent: null,
      }],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('<message>')
    expect(xml).toContain('Hello World')
    expect(xml).toContain('</message>')
    expect(xml).not.toContain('<TEXT>')
  })

  it('should handle empty TEXT nodes', () => {
    const node: SmithersNode = {
      type: 'TEXT',
      props: { value: '' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toBe('')
  })

  /**
   * Edge cases
   */
  it('should handle null and undefined prop values', () => {
    const node: SmithersNode = {
      type: 'task',
      props: {
        name: 'test',
        nullValue: null,
        undefinedValue: undefined,
      },
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('null')
    expect(xml).not.toContain('undefined')
  })

  it('should convert tag names to lowercase', () => {
    const node: SmithersNode = {
      type: 'MyTask',
      props: {},
      children: [],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('<mytask')
    expect(xml).not.toContain('<MyTask')
  })
})

describe('XML Serialization - Tree Manipulation', () => {
  it('should handle tree with circular parent-child references', () => {
    const parent: SmithersNode = {
      type: 'parent',
      props: {},
      children: [],
      parent: null,
    }
    const child: SmithersNode = {
      type: 'child',
      props: {},
      children: [],
      parent: parent,
    }
    parent.children.push(child)
    
    const xml = serialize(parent)
    
    expect(xml).toContain('<parent>')
    expect(xml).toContain('<child />')
    expect(xml).toContain('</parent>')
  })

  it('should handle sibling nodes correctly', () => {
    const parent: SmithersNode = {
      type: 'parent',
      props: {},
      children: [
        { type: 'sibling1', props: {}, children: [], parent: null },
        { type: 'sibling2', props: {}, children: [], parent: null },
        { type: 'sibling3', props: {}, children: [], parent: null },
      ],
      parent: null,
    }
    
    const xml = serialize(parent)
    
    expect(xml).toContain('<sibling1 />')
    expect(xml).toContain('<sibling2 />')
    expect(xml).toContain('<sibling3 />')
  })

  it('should preserve order of children', () => {
    const parent: SmithersNode = {
      type: 'list',
      props: {},
      children: [
        { type: 'item', props: { order: 1 }, children: [], parent: null },
        { type: 'item', props: { order: 2 }, children: [], parent: null },
        { type: 'item', props: { order: 3 }, children: [], parent: null },
      ],
      parent: null,
    }
    
    const xml = serialize(parent)
    const lines = xml.split('\n')
    
    const order1Idx = lines.findIndex(l => l.includes('order="1"'))
    const order2Idx = lines.findIndex(l => l.includes('order="2"'))
    const order3Idx = lines.findIndex(l => l.includes('order="3"'))
    
    expect(order1Idx).toBeLessThan(order2Idx)
    expect(order2Idx).toBeLessThan(order3Idx)
  })

  it('should handle deeply nested mixed content', () => {
    const deep: SmithersNode = {
      type: 'level4',
      props: {},
      children: [
        { type: 'TEXT', props: { value: 'deepest text' }, children: [], parent: null }
      ],
      parent: null,
    }
    const level3: SmithersNode = {
      type: 'level3',
      props: { attr: 'three' },
      children: [deep],
      parent: null,
    }
    const level2: SmithersNode = {
      type: 'level2',
      props: {},
      children: [level3],
      parent: null,
    }
    const level1: SmithersNode = {
      type: 'level1',
      props: {},
      children: [level2],
      parent: null,
    }
    
    const xml = serialize(level1)
    
    expect(xml).toContain('<level1>')
    expect(xml).toContain('<level2>')
    expect(xml).toContain('<level3 attr="three">')
    expect(xml).toContain('<level4>')
    expect(xml).toContain('deepest text')
    expect(xml).toContain('</level4>')
    expect(xml).toContain('</level1>')
  })
})

describe('XML Serialization - Rendering Edge Cases', () => {
  it('should handle node with only key attribute', () => {
    const node: SmithersNode = {
      type: 'task',
      key: 'only-key',
      props: {},
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toBe('<task key="only-key" />')
  })

  it('should handle multiple props in consistent order', () => {
    const node: SmithersNode = {
      type: 'task',
      key: 'k',
      props: { alpha: 'a', beta: 'b', gamma: 'g' },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    // Key should always be first
    expect(xml).toMatch(/^<task key="k"/)
    expect(xml).toContain('alpha="a"')
    expect(xml).toContain('beta="b"')
    expect(xml).toContain('gamma="g"')
  })

  it('should handle boolean false prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { enabled: false },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('enabled="false"')
  })

  it('should handle boolean true prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { enabled: true },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('enabled="true"')
  })

  it('should handle zero number prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { count: 0 },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('count="0"')
  })

  it('should handle negative number prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { offset: -10 },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('offset="-10"')
  })

  it('should handle float number prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { ratio: 3.14159 },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('ratio="3.14159"')
  })

  it('should handle very long attribute value', () => {
    const longValue = 'x'.repeat(5000)
    const node: SmithersNode = {
      type: 'task',
      props: { data: longValue },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain(`data="${longValue}"`)
  })

  it('should handle empty string prop', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { name: '' },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('name=""')
  })
})

describe('XML Serialization - Known Types Warning System', () => {
  it('should add warning for claude inside custom element', () => {
    const claude: SmithersNode = {
      type: 'claude',
      props: { model: 'test' },
      children: [],
      parent: null,
    }
    const custom: SmithersNode = {
      type: 'my-custom-loop',
      props: {},
      children: [claude],
      parent: null,
    }
    claude.parent = custom
    
    serialize(custom)
    
    expect(claude.warnings).toBeDefined()
    expect(claude.warnings![0]).toContain('<claude>')
    expect(claude.warnings![0]).toContain('<my-custom-loop>')
  })

  it('should not add warning for task inside phase', () => {
    const task: SmithersNode = {
      type: 'task',
      props: {},
      children: [],
      parent: null,
    }
    const phase: SmithersNode = {
      type: 'phase',
      props: {},
      children: [task],
      parent: null,
    }
    task.parent = phase
    
    serialize(phase)
    
    expect(task.warnings).toBeUndefined()
  })

  it('should handle ROOT parent correctly (no warning)', () => {
    const claude: SmithersNode = {
      type: 'claude',
      props: {},
      children: [],
      parent: null,
    }
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [claude],
      parent: null,
    }
    claude.parent = root
    
    serialize(root)
    
    expect(claude.warnings).toBeUndefined()
  })

  it('should check all known types', () => {
    const knownTypes = [
      'claude', 'ralph', 'phase', 'step', 'task', 'persona',
      'constraints', 'human', 'smithers-stop', 'subagent',
      'orchestration', 'review', 'text', 'root', 'messages',
      'message', 'tool-call'
    ]
    
    for (const type of knownTypes) {
      const known: SmithersNode = {
        type,
        props: {},
        children: [],
        parent: null,
      }
      const custom: SmithersNode = {
        type: 'unknown-wrapper',
        props: {},
        children: [known],
        parent: null,
      }
      known.parent = custom
      
      serialize(custom)
      
      expect(known.warnings).toBeDefined()
      expect(known.warnings![0]).toContain(`<${type}>`)
    }
  })
})

describe('XML Serialization - Prop Value Types', () => {
  it('should serialize Date object as JSON string', () => {
    const date = new Date('2024-01-15T12:00:00Z')
    const node: SmithersNode = {
      type: 'task',
      props: { created: date },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('created=')
    expect(xml).toContain('2024')
  })

  it('should serialize RegExp as string', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { pattern: /test\d+/gi },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('pattern=')
  })

  it('should serialize Map/Set using JSON fallback', () => {
    const map = new Map([['key', 'value']])
    const node: SmithersNode = {
      type: 'task',
      props: { data: map },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    // Map serializes to empty object {} in JSON.stringify
    expect(xml).toContain('data=')
  })

  it('should serialize array of objects', () => {
    const node: SmithersNode = {
      type: 'task',
      props: { 
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      },
      children: [],
      parent: null,
    }
    
    const xml = serialize(node)
    
    expect(xml).toContain('items=')
    expect(xml).toContain('first')
    expect(xml).toContain('second')
  })
})

describe('XML Serialization - Complex Scenarios', () => {
  it('should serialize realistic component tree', () => {
    const persona: SmithersNode = {
      type: 'persona',
      props: { role: 'developer' },
      children: [
        { type: 'TEXT', props: { value: 'You are a senior developer.' }, children: [], parent: null }
      ],
      parent: null,
    }
    
    const task1: SmithersNode = {
      type: 'task',
      key: 'task-1',
      props: { name: 'implement-feature' },
      children: [],
      parent: null,
    }
    
    const task2: SmithersNode = {
      type: 'task',
      key: 'task-2', 
      props: { name: 'write-tests' },
      children: [],
      parent: null,
    }
    
    const phase: SmithersNode = {
      type: 'phase',
      props: { name: 'development' },
      children: [persona, task1, task2],
      parent: null,
    }
    
    persona.parent = phase
    task1.parent = phase
    task2.parent = phase
    
    const xml = serialize(phase)
    
    expect(xml).toContain('<phase name="development">')
    expect(xml).toContain('<persona role="developer">')
    expect(xml).toContain('You are a senior developer.')
    expect(xml).toContain('key="task-1"')
    expect(xml).toContain('key="task-2"')
    expect(xml).toContain('</phase>')
  })

  it('should handle tree modification between serializes', () => {
    const child: SmithersNode = {
      type: 'child',
      props: { name: 'original' },
      children: [],
      parent: null,
    }
    const parent: SmithersNode = {
      type: 'parent',
      props: {},
      children: [child],
      parent: null,
    }
    child.parent = parent
    
    let xml1 = serialize(parent)
    expect(xml1).toContain('name="original"')
    
    // Modify the tree
    child.props.name = 'modified'
    
    let xml2 = serialize(parent)
    expect(xml2).toContain('name="modified"')
  })

  it('should handle adding/removing children between serializes', () => {
    const parent: SmithersNode = {
      type: 'parent',
      props: {},
      children: [],
      parent: null,
    }
    
    let xml1 = serialize(parent)
    expect(xml1).toBe('<parent />')
    
    // Add child
    const child: SmithersNode = {
      type: 'child',
      props: {},
      children: [],
      parent: parent,
    }
    parent.children.push(child)
    
    let xml2 = serialize(parent)
    expect(xml2).toContain('<parent>')
    expect(xml2).toContain('<child />')
    expect(xml2).toContain('</parent>')
    
    // Remove child
    parent.children = []
    
    let xml3 = serialize(parent)
    expect(xml3).toBe('<parent />')
  })
})
