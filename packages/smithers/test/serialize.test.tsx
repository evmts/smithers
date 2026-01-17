import { describe, test, expect } from 'vitest'
import { createSmithersRoot } from '../src/root'
import { serialize } from '../src/serialize'

describe('Serialization', () => {
  test('serializes simple tree to XML', () => {
    const root = createSmithersRoot()

    root.mount(() => <claude model="sonnet">Hello world</claude>)

    const xml = serialize(root.getTree())

    expect(xml).toContain('<claude model="sonnet">')
    expect(xml).toContain('Hello world')
    expect(xml).toContain('</claude>')

    root.dispose()
  })

  test('serializes nested elements', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <claude>
        <phase name="research">
          <step>Find sources</step>
        </phase>
      </claude>
    ))

    const xml = serialize(root.getTree())

    expect(xml).toContain('<claude>')
    expect(xml).toContain('<phase name="research">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Find sources')

    root.dispose()
  })

  test('escapes XML special characters', () => {
    // Manually create node to avoid JSX escaping
    const node = {
      type: 'claude',
      props: {},
      children: [
        {
          type: 'TEXT',
          props: { value: 'Test & "quotes" < >' },
          children: [],
          parent: null,
        },
      ],
      parent: null,
    }

    const xml = serialize(node)

    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;')
    expect(xml).toContain('&lt;')
    expect(xml).toContain('&gt;')
  })

  test('does not serialize callback props', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <claude onFinished={() => {}} onError={() => {}}>
        Test
      </claude>
    ))

    const xml = serialize(root.getTree())

    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')

    root.dispose()
  })
})
