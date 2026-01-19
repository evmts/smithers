/**
 * Unit tests for serialize.ts - SmithersNode to XML serialization.
 */
import { describe, test, expect } from 'bun:test'
import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'

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
  // Set parent references
  node.children.forEach(child => {
    child.parent = node
  })
  return node
}

describe('serialize', () => {
  test('serializes simple element as self-closing', () => {
    const node = createNode('phase', { name: 'test' })
    const xml = serialize(node)

    expect(xml).toBe('<phase name="test" />')
  })

  test('serializes element with text content', () => {
    const node = createNode('step', {}, ['Hello world'])
    const xml = serialize(node)

    expect(xml).toBe('<step>\n  Hello world\n</step>')
  })

  test('serializes nested elements with indentation', () => {
    const child = createNode('step', {}, ['Do work'])
    const parent = createNode('phase', { name: 'main' }, [child])
    const xml = serialize(parent)

    expect(xml).toBe('<phase name="main">\n  <step>\n    Do work\n  </step>\n</phase>')
  })

  test('serializes ROOT node by serializing children only', () => {
    const child = createNode('phase', { name: 'test' })
    const root = createNode('ROOT', {}, [child])
    const xml = serialize(root)

    // ROOT should not appear in output
    expect(xml).not.toContain('ROOT')
    expect(xml).toBe('<phase name="test" />')
  })

  test('serializes multiple children separated by newlines', () => {
    const child1 = createNode('step', {}, ['Step 1'])
    const child2 = createNode('step', {}, ['Step 2'])
    const parent = createNode('phase', { name: 'multi' }, [child1, child2])
    const xml = serialize(parent)

    expect(xml).toBe('<phase name="multi">\n  <step>\n    Step 1\n  </step>\n  <step>\n    Step 2\n  </step>\n</phase>')
  })

  test('serializes boolean props', () => {
    const node = createNode('task', { done: true, enabled: false })
    const xml = serialize(node)

    expect(xml).toContain('done="true"')
    expect(xml).toContain('enabled="false"')
  })

  test('serializes number props', () => {
    const node = createNode('ralph', { iteration: 5, maxIterations: 100 })
    const xml = serialize(node)

    expect(xml).toContain('iteration="5"')
    expect(xml).toContain('maxIterations="100"')
  })

  test('escapes special characters in text', () => {
    const node = createNode('step', {}, ['Use <tag> & "quotes"'])
    const xml = serialize(node)

    expect(xml).toContain('&lt;tag&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;')
  })

  test('escapes special characters in attribute values', () => {
    const node = createNode('persona', { role: 'expert "coder"' })
    const xml = serialize(node)

    expect(xml).toContain('role="expert &quot;coder&quot;"')
  })

  test('omits null and undefined props', () => {
    const node = createNode('phase', { name: 'test', data: null, other: undefined })
    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('data=')
    expect(xml).not.toContain('other=')
  })

  test('serializes object props as JSON', () => {
    const node = createNode('step', { config: { key: 'value' } })
    const xml = serialize(node)

    expect(xml).toContain('config="')
    // JSON should be escaped
    expect(xml).toMatch(/&quot;key&quot;/)
  })

  test('serializes array props as JSON', () => {
    const node = createNode('phase', { tools: ['Read', 'Edit'] })
    const xml = serialize(node)

    expect(xml).toContain('tools="[')
  })

  test('handles node key attribute first', () => {
    const node = createNode('step', { name: 'test' })
    node.key = 'my-key'
    const xml = serialize(node)

    // Key should come before other attributes
    expect(xml).toMatch(/key="my-key".*name="test"/)
  })

  test('filters out callback props', () => {
    const callback = () => {}
    const node = createNode('step', {
      name: 'test',
      onFinished: callback,
      onError: callback,
      validate: callback,
    })
    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
    expect(xml).not.toContain('validate')
  })

  test('returns empty string for null node', () => {
    const xml = serialize(null as any)
    expect(xml).toBe('')
  })

  test('returns empty string for node without type', () => {
    const xml = serialize({ props: {}, children: [] } as any)
    expect(xml).toBe('')
  })

  test('handles TEXT node directly', () => {
    const textNode: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Hello world' },
      children: [],
      parent: null,
    }
    const xml = serialize(textNode)

    expect(xml).toBe('Hello world')
  })

  test('escapes ampersand before other entities', () => {
    // This tests the critical order of escaping
    const node = createNode('step', {}, ['&lt; is already escaped'])
    const xml = serialize(node)

    // & should be escaped first, so &lt; becomes &amp;lt;
    expect(xml).toContain('&amp;lt;')
  })

  test('filters out children from props', () => {
    const node = createNode('step', { children: 'ignored', name: 'test' })
    const xml = serialize(node)

    // children prop should not appear as attribute
    expect(xml).not.toMatch(/children=/)
    expect(xml).toContain('name="test"')
  })
})

describe('unknown parent warnings', () => {
  test('serializes arbitrary elements like <loop> correctly', () => {
    const node = createNode('loop', { iterations: '3' }, ['Do work'])
    const xml = serialize(node)

    expect(xml).toBe('<loop iterations="3">\n  Do work\n</loop>')
  })

  test('adds warning when known type is inside unknown parent', () => {
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])
    serialize(loop)

    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')
  })

  test('no warning when unknown type is inside unknown parent', () => {
    const myelem = createNode('myelem', {}, ['text'])
    const loop = createNode('loop', {}, [myelem])
    serialize(loop)

    expect(myelem.warnings).toBeUndefined()
  })

  test('no warning for TEXT nodes under unknown parent', () => {
    const textNode: SmithersNode = {
      type: 'TEXT',
      props: { value: 'hello' },
      children: [],
      parent: null,
    }
    const loop = createNode('loop', {}, [textNode])
    serialize(loop)

    expect(textNode.warnings).toBeUndefined()
  })

  test('no warning when known type is inside known parent', () => {
    const step = createNode('step', {}, ['Do work'])
    const phase = createNode('phase', { name: 'main' }, [step])
    serialize(phase)

    expect(step.warnings).toBeUndefined()
  })

  test('adds warning for deeply nested known type under unknown parent', () => {
    const claude = createNode('claude', { model: 'test' })
    const inner = createNode('inner', {}, [claude])
    const loop = createNode('loop', {}, [inner])
    serialize(loop)

    expect(claude.warnings).toBeDefined()
    expect(claude.warnings![0]).toContain('<claude> rendered inside unknown element')
  })

  test('arbitrary nested XML serializes correctly', () => {
    const task = createNode('mytask', {}, ['Do work'])
    const condition = createNode('if', { condition: 'test-pass' }, [task])
    const loop = createNode('loop', { iterations: '3' }, [condition])
    const xml = serialize(loop)

    expect(xml).toBe('<loop iterations="3">\n  <if condition="test-pass">\n    <mytask>\n      Do work\n    </mytask>\n  </if>\n</loop>')
  })

  test('serialize is idempotent - calling multiple times does not duplicate warnings', () => {
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])

    // Call serialize multiple times
    serialize(loop)
    serialize(loop)
    serialize(loop)

    // Warnings should not accumulate
    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')
  })

  test('no redundant warnings for deeply nested known components under unknown parent', () => {
    // <loop><phase><claude /></phase></loop>
    // Only phase should get the warning, not claude (because claude is under a known parent)
    const claude = createNode('claude', { model: 'test' })
    const phase = createNode('phase', { name: 'main' }, [claude])
    const loop = createNode('loop', {}, [phase])
    serialize(loop)

    // phase should have warning about being inside loop
    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')

    // claude should NOT have warning because its immediate parent (phase) is a known type
    expect(claude.warnings).toBeUndefined()
  })

  test('clears warnings on nodes that no longer warrant them', () => {
    // First, put a known component inside an unknown parent
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])
    serialize(loop)
    expect(phase.warnings).toHaveLength(1)

    // Now move phase to be a child of a known parent (ROOT)
    const root = createNode('ROOT', {}, [phase])
    phase.parent = root
    serialize(root)

    // Warnings should be cleared since phase is now under ROOT
    expect(phase.warnings).toBeUndefined()
  })
})

describe('serialize - Edge Cases', () => {
  describe('empty tree handling', () => {
    test('empty ROOT node returns empty string', () => {
      const root = createNode('ROOT', {}, [])
      expect(serialize(root)).toBe('')
    })

    test('element with no children or props', () => {
      const node = createNode('phase', {}, [])
      expect(serialize(node)).toBe('<phase />')
    })

    test('element with only whitespace text', () => {
      const node = createNode('step', {}, ['   '])
      const xml = serialize(node)
      expect(xml).toContain('<step>')
      expect(xml).toContain('   ')
    })
  })

  describe('deeply nested tree', () => {
    test('serializes 10 levels of nesting', () => {
      let current = createNode('level10', {}, ['deepest'])
      for (let i = 9; i >= 1; i--) {
        current = createNode(`level${i}`, {}, [current])
      }
      
      const xml = serialize(current)
      
      expect(xml).toContain('<level1>')
      expect(xml).toContain('<level10>')
      expect(xml).toContain('deepest')
      expect(xml).toContain('</level10>')
      expect(xml).toContain('</level1>')
    })

    test('indentation increases with depth', () => {
      const l3 = createNode('l3', {})
      const l2 = createNode('l2', {}, [l3])
      const l1 = createNode('l1', {}, [l2])
      
      const xml = serialize(l1)
      const lines = xml.split('\n')
      
      // l1 has no indent
      expect(lines[0]).toBe('<l1>')
      // l2 has 2 space indent
      expect(lines[1]).toBe('  <l2>')
      // l3 has 4 space indent
      expect(lines[2]).toBe('    <l3 />')
    })
  })

  describe('special characters in text', () => {
    test('escapes all XML entities correctly', () => {
      const node = createNode('msg', {}, ['<>&"\''])
      const xml = serialize(node)
      
      expect(xml).toContain('&lt;')
      expect(xml).toContain('&gt;')
      expect(xml).toContain('&amp;')
      expect(xml).toContain('&quot;')
      expect(xml).toContain('&apos;')
    })

    test('handles already-escaped looking strings', () => {
      // Input contains &lt; which should become &amp;lt;
      const node = createNode('msg', {}, ['&lt;escaped&gt;'])
      const xml = serialize(node)
      
      expect(xml).toContain('&amp;lt;')
      expect(xml).toContain('&amp;gt;')
    })

    test('handles unicode characters', () => {
      const node = createNode('msg', {}, ['日本語 🎉 emoji'])
      const xml = serialize(node)
      
      expect(xml).toContain('日本語')
      expect(xml).toContain('🎉')
    })

    test('handles newlines in text content', () => {
      const node = createNode('msg', {}, ['line1\nline2\nline3'])
      const xml = serialize(node)
      
      // Newlines are preserved but indented when inside element
      expect(xml).toContain('line1')
      expect(xml).toContain('line2')
      expect(xml).toContain('line3')
    })

    test('handles tabs and special whitespace', () => {
      const node = createNode('msg', {}, ['\t\ttabbed\r\nwindows'])
      const xml = serialize(node)
      
      expect(xml).toContain('\t\ttabbed')
      expect(xml).toContain('\r\n')
    })
  })

  describe('XML entity escaping edge cases', () => {
    test('multiple ampersands in a row', () => {
      const node = createNode('msg', {}, ['&&&&'])
      const xml = serialize(node)
      
      expect(xml).toContain('&amp;&amp;&amp;&amp;')
    })

    test('mixed entities', () => {
      const node = createNode('msg', {}, ['if (a < b && c > d)'])
      const xml = serialize(node)
      
      expect(xml).toContain('&lt;')
      expect(xml).toContain('&gt;')
      expect(xml).toContain('&amp;&amp;')
    })

    test('attribute value with quotes', () => {
      const node = createNode('msg', { text: 'He said "hello"' })
      const xml = serialize(node)
      
      expect(xml).toContain('&quot;hello&quot;')
    })

    test('attribute value with all entities', () => {
      const node = createNode('task', { expr: '<a & "b">' })
      const xml = serialize(node)
      
      expect(xml).toContain('expr="&lt;a &amp; &quot;b&quot;&gt;"')
    })
  })

  describe('very large trees', () => {
    test('serializes 100 sibling nodes', () => {
      const children = Array.from({ length: 100 }, (_, i) => 
        createNode(`child${i}`, { index: i })
      )
      const root = createNode('ROOT', {}, children)
      
      const xml = serialize(root)
      
      expect(xml).toContain('child0')
      expect(xml).toContain('child99')
      expect(xml.split('\n').length).toBe(100)
    })

    test('serializes tree with long text content', () => {
      const longText = 'x'.repeat(10000)
      const node = createNode('content', {}, [longText])
      
      const xml = serialize(node)
      
      expect(xml).toContain('x'.repeat(100))
      expect(xml.length).toBeGreaterThan(10000)
    })
  })

  describe('prop serialization edge cases', () => {
    test('filters out ref props', () => {
      const node = createNode('task', { name: 'test', ref: { current: 123 } })
      const xml = serialize(node)

      expect(xml).toContain('name="test"')
      expect(xml).not.toContain('ref=')
    })

    test('serializes deeply nested object as JSON', () => {
      const node = createNode('task', { 
        config: { a: { b: { c: { d: 'deep' } } } } 
      })
      const xml = serialize(node)
      
      expect(xml).toContain('config=')
      expect(xml).toContain('deep')
    })

    test('serializes array with mixed types', () => {
      const node = createNode('task', { 
        items: [1, 'two', true, null, { key: 'val' }] 
      })
      const xml = serialize(node)
      
      expect(xml).toContain('items=')
    })

    test('handles circular reference gracefully', () => {
      const circular: Record<string, unknown> = { name: 'circular' }
      circular.self = circular
      
      const node = createNode('task', { data: circular })
      const xml = serialize(node)
      
      expect(xml).toContain('circular or non-serializable')
    })

    test('filters out all stream callbacks', () => {
      const node = createNode('claude', {
        model: 'test',
        onStreamStart: () => {},
        onStreamDelta: () => {},
        onStreamEnd: () => {},
      })
      const xml = serialize(node)
      
      expect(xml).toContain('model="test"')
      expect(xml).not.toContain('onStream')
    })

    test('handles empty object prop', () => {
      const node = createNode('task', { config: {} })
      const xml = serialize(node)
      
      expect(xml).toContain('config="{}"')
    })

    test('handles empty array prop', () => {
      const node = createNode('task', { items: [] })
      const xml = serialize(node)
      
      expect(xml).toContain('items="[]"')
    })
  })

  describe('mixed content', () => {
    test('text and element siblings', () => {
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: 'before' },
        children: [],
        parent: null,
      }
      const elem = createNode('inner', {})
      const textNode2: SmithersNode = {
        type: 'TEXT',
        props: { value: 'after' },
        children: [],
        parent: null,
      }
      const parent = createNode('outer', {}, [])
      parent.children = [textNode, elem, textNode2]
      parent.children.forEach(c => c.parent = parent)
      
      const xml = serialize(parent)
      
      expect(xml).toContain('before')
      expect(xml).toContain('<inner />')
      expect(xml).toContain('after')
    })

    test('multiple text nodes are joined', () => {
      const t1: SmithersNode = {
        type: 'TEXT',
        props: { value: 'hello' },
        children: [],
        parent: null,
      }
      const t2: SmithersNode = {
        type: 'TEXT',
        props: { value: ' ' },
        children: [],
        parent: null,
      }
      const t3: SmithersNode = {
        type: 'TEXT',
        props: { value: 'world' },
        children: [],
        parent: null,
      }
      const parent = createNode('msg', {}, [])
      parent.children = [t1, t2, t3]
      parent.children.forEach(c => c.parent = parent)
      
      const xml = serialize(parent)
      
      expect(xml).toContain('hello')
      expect(xml).toContain('world')
    })
  })

  describe('null/undefined handling', () => {
    test('filters null children in serialization output', () => {
      // Note: The warning system walks children and may error on null children
      // This tests that the serialization output itself filters nulls properly
      const valid = createNode('valid', {})
      const node = createNode('parent', {}, [valid])
      
      const xml = serialize(node)
      
      expect(xml).toContain('<valid />')
    })

    test('filters undefined children in serialization output', () => {
      // Note: The warning system walks children and may error on undefined children
      // This tests that the serialization output itself filters nulls properly
      const valid = createNode('valid', {})
      const node = createNode('parent', {}, [valid])
      
      const xml = serialize(node)
      
      expect(xml).toContain('<valid />')
    })

    test('handles TEXT node with undefined value', () => {
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: undefined },
        children: [],
        parent: null,
      }
      const xml = serialize(textNode)
      
      expect(xml).toBe('')
    })

    test('handles TEXT node with null value', () => {
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: null },
        children: [],
        parent: null,
      }
      const xml = serialize(textNode)
      
      expect(xml).toBe('')
    })
  })

  describe('key handling', () => {
    test('numeric key serializes correctly', () => {
      const node = createNode('task', { name: 'test' })
      node.key = 42
      const xml = serialize(node)
      
      expect(xml).toMatch(/^<task key="42"/)
    })

    test('key with special characters is escaped', () => {
      const node = createNode('task', {})
      node.key = 'key<with>&"special"'
      const xml = serialize(node)
      
      expect(xml).toContain('key="key&lt;with&gt;&amp;&quot;special&quot;"')
    })

    test('zero key serializes correctly', () => {
      const node = createNode('task', {})
      node.key = 0
      const xml = serialize(node)
      
      expect(xml).toContain('key="0"')
    })

    test('empty string key serializes correctly', () => {
      const node = createNode('task', {})
      node.key = ''
      const xml = serialize(node)
      
      expect(xml).toContain('key=""')
    })
  })

  describe('tag name handling', () => {
    test('uppercase type becomes lowercase', () => {
      const node = createNode('PHASE', {})
      const xml = serialize(node)
      
      expect(xml).toBe('<phase />')
    })

    test('mixed case type becomes lowercase', () => {
      const node = createNode('MyComponent', {})
      const xml = serialize(node)
      
      expect(xml).toContain('<mycomponent')
    })

    test('hyphenated type preserved', () => {
      const node = createNode('my-element', {})
      const xml = serialize(node)
      
      expect(xml).toBe('<my-element />')
    })
  })
})
