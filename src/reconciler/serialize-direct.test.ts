/**
 * Direct tests for serialize() function.
 *
 * CRITICAL: These tests create nodes MANUALLY (not with JSX) to properly
 * test entity escaping. JSX pre-escapes entities which would cause false positives.
 *
 * This is the #1 gotcha in XML serialization testing!
 */

import { describe, it, expect } from 'bun:test'
import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'

describe('XML Serialization (Direct Node Creation)', () => {
  /**
   * GOTCHA #1: Entity Escaping
   * Create nodes MANUALLY - JSX pre-escapes entities!
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
