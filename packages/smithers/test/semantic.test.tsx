import { describe, test, expect } from 'vitest'
import { createSmithersRoot } from '../src/root'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { serialize } from '../src/serialize'

describe('Semantic Components', () => {
  test('Phase renders with name prop', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Phase name="research">Content</Phase>
    ))

    const xml = serialize(root.getTree())
    expect(xml).toContain('<phase name="research">')
    expect(xml).toContain('Content')

    root.dispose()
  })

  test('Step renders children', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Step>Find sources</Step>
    ))

    const xml = serialize(root.getTree())
    expect(xml).toContain('<step>')
    expect(xml).toContain('Find sources')

    root.dispose()
  })

  test('Phase and Step compose together', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Phase name="test">
        <Step>First step</Step>
        <Step>Second step</Step>
      </Phase>
    ))

    const xml = serialize(root.getTree())
    expect(xml).toContain('<phase name="test">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('First step')
    expect(xml).toContain('Second step')

    root.dispose()
  })
})
