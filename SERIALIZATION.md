# XML Serialization Gotchas

This document explains the tricky parts of XML serialization in Smithers.

## The #1 Gotcha: JSX Entity Escaping

**THE PROBLEM:**

When you write JSX like `<div>Test & < ></div>`, the JSX compiler **pre-escapes** entities:

```tsx
// What you write:
<claude>Test & "quotes" < ></claude>

// What reaches your renderer:
{ type: 'TEXT', props: { value: 'Test &amp; &quot;quotes&quot; &lt; &gt;' } }
// ☠️ Already escaped!
```

If your `serialize()` function escapes this again, you get **double-escaping**:

```xml
<!-- ❌ Wrong (double-escaped): -->
<claude>Test &amp;amp; &amp;quot;quotes&amp;quot; &amp;lt; &amp;gt;</claude>

<!-- ✅ Right (single-escaped): -->
<claude>Test &amp; &quot;quotes&quot; &lt; &gt;</claude>
```

**THE SOLUTION:**

In your tests, create nodes **MANUALLY** without JSX:

```typescript
it('should escape XML entities', () => {
  // ✅ CORRECT: Create node manually with raw string
  const node: SmithersNode = {
    type: 'claude',
    props: {},
    children: [{
      type: 'TEXT',
      props: { value: 'Test & "quotes" < >' },  // Raw string, not JSX!
      children: [],
      parent: null
    }],
    parent: null
  }

  const xml = serialize(node)

  expect(xml).toContain('&amp;')   // ✓ Properly escaped
  expect(xml).toContain('&quot;')
  expect(xml).toContain('&lt;')
  expect(xml).toContain('&gt;')
})
```

```typescript
// ❌ WRONG: Using JSX will give false positives
it('should escape XML entities', () => {
  root.mount(() => <claude>Test & "quotes"</claude>)
  const xml = root.toXML()
  expect(xml).toContain('&amp;')  // Will pass but for wrong reason!
})
```

## Gotcha #2: Key Attribute Ordering

**Keys are stored on `node.key`, NOT `node.props.key`:**

```typescript
{
  type: 'task',
  key: 'unique-123',        // ← Here, not in props!
  props: { name: 'test' },
  children: []
}
```

**In XML output, key should appear FIRST** (before other props) for readability:

```xml
✅ <task key="unique-123" name="test" />
❌ <task name="test" key="unique-123" />  <!-- Works but less readable -->
```

**Implementation:**

```typescript
const keyAttr = node.key !== undefined
  ? ` key="${escapeXml(String(node.key))}"`
  : ''

const attrs = serializeProps(node.props)  // Other props after key

return `<${tag}${keyAttr}${attrs} />`  // Key comes first
```

## Gotcha #3: Props to Exclude

**These props should NEVER appear in XML:**

```typescript
const NON_SERIALIZABLE_PROPS = new Set([
  'children',      // Handled separately, not a prop
  'onFinished',    // Callbacks are runtime-only
  'onError',
  'onStreamStart',
  'onStreamDelta',
  'onStreamEnd',
  'validate',      // Functions don't serialize
  'key',           // Stored on node.key, not props
])
```

**Filter them out + handle objects specially:**

```typescript
function serializeProps(props: Record<string, unknown>): string {
  return Object.entries(props)
    .filter(([key]) => !NON_SERIALIZABLE_PROPS.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'function')  // Extra safety
    .map(([key, value]) => {
      // Objects need to be serialized as JSON
      if (typeof value === 'object') {
        return ` ${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })
    .join('')
}
```

## Gotcha #4: Entity Escaping Order

**& MUST be replaced FIRST!**

```typescript
// ❌ WRONG ORDER:
function escapeXml(str: string): string {
  return str
    .replace(/</g, '&lt;')   // '<' becomes '&lt;'
    .replace(/&/g, '&amp;')  // '&lt;' becomes '&amp;lt;' ☠️
}

// ✅ CORRECT ORDER:
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')  // MUST be first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
```

**Why:** If you replace `&` last, you'll escape the `&` characters from your other replacements!

## Gotcha #5: ROOT Node Special Case

**ROOT nodes don't output wrapper tags:**

```typescript
// Input:
{
  type: 'ROOT',
  children: [
    { type: 'task', props: { name: 'first' }, children: [] },
    { type: 'task', props: { name: 'second' }, children: [] }
  ]
}

// ✅ Output:
<task name="first" />
<task name="second" />

// ❌ NOT:
<ROOT>
  <task name="first" />
  <task name="second" />
</ROOT>
```

**Implementation:**

```typescript
if (node.type === 'ROOT') {
  return node.children.map(serialize).join('\n')  // Just children, no wrapper
}
```

## Gotcha #6: TEXT Nodes

**TEXT nodes serialize to just their value (no tags):**

```typescript
// Input:
{
  type: 'TEXT',
  props: { value: 'Hello World' },
  children: []
}

// ✅ Output:
Hello World

// ❌ NOT:
<TEXT>Hello World</TEXT>
```

## Gotcha #7: Self-Closing Tags

**Empty elements use self-closing syntax:**

```xml
✅ <task name="test" />
❌ <task name="test"></task>
```

**Implementation:**

```typescript
const children = node.children.map(serialize).join('\n')

if (!children) {
  return `<${tag}${keyAttr}${attrs} />`  // Self-closing
}

return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
```

## Summary: Common Mistakes to Avoid

1. ❌ Testing entity escaping with JSX (will get double-escaped)
2. ❌ Putting `&` replacement last in `escapeXml` (will escape other escapes)
3. ❌ Including callbacks in XML output
4. ❌ Not handling ROOT node specially (will output `<ROOT>` tags)
5. ❌ Forgetting to convert key to string (may be number)
6. ❌ Not indenting nested children
7. ❌ Using `<tag></tag>` instead of `<tag />` for empty elements

## Example Transformations

```typescript
// Example 1: Simple element with props
Input:  { type: 'task', props: { name: 'test', count: 42 }, children: [] }
Output: '<task name="test" count="42" />'

// Example 2: Element with text child
Input:  {
  type: 'claude',
  props: { model: 'sonnet' },
  children: [{ type: 'TEXT', props: { value: 'Hello' }, children: [] }]
}
Output: '<claude model="sonnet">\n  Hello\n</claude>'

// Example 3: Nested structure with indentation
Input:  {
  type: 'phase',
  props: { name: 'setup' },
  children: [
    { type: 'task', props: { name: 'init' }, children: [] }
  ]
}
Output: '<phase name="setup">\n  <task name="init" />\n</phase>'
```

## Success Criteria

- ✅ All 15 serialization tests pass
- ✅ Entity escaping works (single-escaped, not double)
- ✅ Key appears first in attribute list
- ✅ Callbacks filtered out of XML
- ✅ Proper indentation for nested structures
- ✅ Self-closing tags for empty elements
- ✅ ROOT node doesn't output wrapper tags
- ✅ Object props serialized as JSON
