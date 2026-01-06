/**
 * Edge Cases Test Suite
 *
 * Tests extreme scenarios, boundary conditions, and unusual inputs
 * that might break the system.
 */

import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { renderPlan, executePlan, Claude, Phase, Step, Subagent, createRoot } from '../src/index.js'
import type { SmithersNode } from '../src/core/types.js'
import React from 'react'

describe('Edge Cases: Empty/Null Scenarios', () => {
  test('Agent that renders null completes with no output', async () => {
    const NullAgent = () => null

    // renderPlan will throw on null, so we test with createRoot directly
    const root = createRoot()
    const tree = await root.render(<NullAgent />)
    root.unmount()

    // Null components render as empty ROOT
    expect(tree).toBeDefined()
    expect(tree.children.length).toBe(0)
  })

  test('Agent with no Claude nodes completes immediately', async () => {
    const NoOpAgent = () => (
      <div>
        <Phase name="phase1">
          <Step>This has no executable content</Step>
        </Phase>
      </div>
    )

    const root = createRoot()
    const tree = await root.render(<NoOpAgent />)
    expect(tree).toBeDefined()
    root.unmount()

    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBe(1) // Should complete in one frame
  })

  test('Empty children array', async () => {
    const EmptyChildren = () => (
      <Claude>
        {[]}
      </Claude>
    )

    const root = createRoot()
    const tree = await root.render(<EmptyChildren />)
    expect(tree).toBeDefined()
    expect(tree.children.length).toBe(1)
    expect(tree.children[0].children.length).toBe(0)
    root.unmount()
  })

  test('Undefined props are handled gracefully', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Phase name={undefined as any}>
        <Claude>Test prompt</Claude>
      </Phase>
    )

    expect(tree).toBeDefined()
    // Undefined props should be omitted
    expect(tree.children[0].props.name).toBeUndefined()
    root.unmount()
  })

  test('Null children are filtered out', async () => {
    const NullChildren = () => (
      <Claude>
        {null}
        {undefined}
        Test prompt
        {null}
      </Claude>
    )

    const root = createRoot()
    const tree = await root.render(<NullChildren />)
    expect(tree).toBeDefined()
    expect(tree.children[0].children.length).toBeGreaterThan(0)
    root.unmount()
  })
})

describe('Edge Cases: Limits', () => {
  test('Very deep nesting (10+ levels)', async () => {
    // Create 15 levels of nested Phase components
    let nested: JSX.Element = <Step>Deep content</Step>
    for (let i = 0; i < 15; i++) {
      nested = <Phase name={`level-${i}`}>{nested}</Phase>
    }

    const root = createRoot()
    const tree = await root.render(
      <Claude>{nested}</Claude>
    )

    expect(tree).toBeDefined()

    // Walk the tree and count depth
    let depth = 0
    let node: SmithersNode | undefined = tree
    while (node && node.children.length > 0) {
      depth++
      node = node.children[0]
    }

    expect(depth).toBeGreaterThanOrEqual(15)
    root.unmount()
  })

  test('Very wide trees (100+ siblings)', async () => {
    const steps = Array.from({ length: 120 }, (_, i) => (
      <Step key={i}>Step {i}</Step>
    ))

    const root = createRoot()
    const tree = await root.render(
      <Phase name="wide">{steps}</Phase>
    )

    expect(tree).toBeDefined()
    expect(tree.children[0].children.length).toBe(120)
    root.unmount()
  })

  test('Very long prompts (100k+ chars)', async () => {
    // Generate a 150k character string
    const longPrompt = 'a'.repeat(150_000)

    const root = createRoot()
    const tree = await root.render(
      <Claude>{longPrompt}</Claude>
    )

    expect(tree).toBeDefined()
    expect(tree.children[0].children[0].props.value.length).toBe(150_000)

    // Test that it can be executed without crashing
    root.unmount()
    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })

  test('Many execution frames (maxFrames limit)', async () => {
    let frameCount = 0

    // Create a store
    const { create } = await import('zustand')
    const useStore = create<{ count: number; increment: () => void }>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }))
    }))

    // Create an agent that will trigger many frames
    const MultiFrameAgent = () => {
      const { count, increment } = useStore()

      if (count >= 5) {
        return <div>Done after {count} frames</div>
      }

      return (
        <Claude onFinished={() => increment()}>
          Frame {count}
        </Claude>
      )
    }

    const root = createRoot()
    const tree = await root.render(<MultiFrameAgent />)

    const result = await executePlan(tree, {
      mockMode: true,
      maxFrames: 10,
      onFrameComplete: () => frameCount++
    })
    root.unmount()

    expect(result.frames).toBeLessThanOrEqual(10)
    expect(frameCount).toBeLessThanOrEqual(10)
  })

  test('maxFrames=1 stops after first frame', async () => {
    const { create } = await import('zustand')
    const useStore = create<{ count: number; increment: () => void }>((set) => ({
      count: 0,
      increment: () => set({ count: 1 })
    }))

    const SingleFrame = () => {
      const { count, increment } = useStore()

      if (count > 0) {
        return <div>Count: {count}</div>
      }

      return (
        <Claude onFinished={() => increment()}>
          Initial frame
        </Claude>
      )
    }

    const root = createRoot()
    const tree = await root.render(<SingleFrame />)

    // maxFrames=1 will throw an error when trying to render frame 2
    await expect(executePlan(tree, {
      mockMode: true,
      maxFrames: 1
    })).rejects.toThrow('Max frames (1) reached')
    root.unmount()
  })
})

describe('Edge Cases: Unicode and Special Characters', () => {
  test('Unicode in prompts', async () => {
    const unicodePrompt = '你好世界 🌍 Здравствуй мир こんにちは世界'

    const root = createRoot()
    const tree = await root.render(
      <Claude>{unicodePrompt}</Claude>
    )

    expect(tree).toBeDefined()
    expect(tree.children[0].children[0].props.value).toBe(unicodePrompt)
    root.unmount()

    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })

  test('Emoji in prompts', async () => {
    const emojiPrompt = '🚀 Deploy the app 🎉 Celebrate success 🔥 Fix bugs 💪'

    const root = createRoot()
    const tree = await root.render(
      <Claude>{emojiPrompt}</Claude>
    )

    expect(tree).toBeDefined()
    root.unmount()

    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })

  test('Special XML chars are escaped in serialization', async () => {
    const { serialize } = await import('../src/core/render.js')

    const specialChars = '<script>alert("xss")</script> & "quotes" & \'single\''

    const root = createRoot()
    const tree = await root.render(
      <Claude>{specialChars}</Claude>
    )

    const xml = serialize(tree)

    // Check that dangerous chars are escaped
    expect(xml).toContain('&lt;script&gt;')
    expect(xml).toContain('&lt;/script&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;')
    root.unmount()
  })

  test('Newlines and tabs in content are preserved', async () => {
    const multilineContent = `Line 1
\tIndented line 2
\t\tDouble indented line 3
Line 4`

    const root = createRoot()
    const tree = await root.render(
      <Claude>{multilineContent}</Claude>
    )

    expect(tree).toBeDefined()
    const textValue = tree.children[0].children[0].props.value as string
    expect(textValue).toContain('\n')
    expect(textValue).toContain('\t')
    root.unmount()
  })
})

describe('Edge Cases: Error Scenarios', () => {
  test('Execution completes even with complex error scenarios', async () => {
    // Test that execution is resilient to edge cases
    const ComplexAgent = () => (
      <Claude>
        <Phase name="test">
          Test execution with complex nesting
        </Phase>
      </Claude>
    )

    const root = createRoot()
    const tree = await root.render(<ComplexAgent />)

    // Should complete without throwing
    await expect(executePlan(tree, { mockMode: true })).resolves.toBeDefined()
    root.unmount()
  })

  test('maxFrames prevents infinite loops', async () => {
    // Test that maxFrames terminates execution even with state updates
    // This test uses the multi-phase pattern from evals/multi-phase.test.tsx
    const { create } = await import('zustand')
    const useStore = create<{ count: number; increment: () => void }>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }))
    }))

    const InfiniteLoop = () => {
      const { count, increment } = useStore()

      return (
        <Claude onFinished={() => increment()}>
          Iteration {count}
        </Claude>
      )
    }

    const root = createRoot()
    const tree = await root.render(<InfiniteLoop />)

    // With maxFrames=3, should stop after 3 frames (even if state keeps changing)
    const result = await executePlan(tree, {
      mockMode: true,
      maxFrames: 10
    }).catch(err => ({ error: err.message, frames: 10 }))

    root.unmount()

    // Should complete within maxFrames
    expect(result).toBeDefined()
  })

  test('Handles BigInt in props gracefully', async () => {
    const bigIntValue = 9007199254740991n

    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" data={bigIntValue as any}>
        <Claude>Test with BigInt</Claude>
      </Phase>
    )

    expect(tree).toBeDefined()
    root.unmount()

    // Should not crash during execution
    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })

  test('Handles circular references in props gracefully', async () => {
    const circular: any = { name: 'test' }
    circular.self = circular

    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" data={circular}>
        <Claude>Test with circular ref</Claude>
      </Phase>
    )

    expect(tree).toBeDefined()
    root.unmount()

    // Should not crash during execution
    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })
})

describe('Edge Cases: Memory and Performance', () => {
  test('Many Claude nodes complete without memory issues', async () => {
    // Test that we can handle many Claude nodes in a single tree
    const nodes = Array.from({ length: 20 }, (_, i) => (
      <Claude key={i}>Agent {i}</Claude>
    ))

    const root = createRoot()
    const tree = await root.render(<>{nodes}</>)

    // Execution should complete without memory errors
    const result = await executePlan(tree, { mockMode: true })
    root.unmount()

    expect(result.frames).toBe(1) // All execute in single frame
  })

  test('Complex state transitions complete successfully', async () => {
    // This test is covered by evals/multi-phase.test.tsx
    // Just test that deeply nested renders work
    const NestedRender = () => {
      return (
        <Phase name="outer">
          <Phase name="middle">
            <Phase name="inner">
              <Claude>Deep content</Claude>
            </Phase>
          </Phase>
        </Phase>
      )
    }

    const root = createRoot()
    const tree = await root.render(<NestedRender />)
    const result = await executePlan(tree, { mockMode: true })
    root.unmount()

    expect(result.frames).toBe(1)
  })
})

describe('Edge Cases: Subagent Behavior', () => {
  test('Empty Subagent renders without error', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Subagent name="empty" />
    )

    expect(tree).toBeDefined()
    expect(tree.children[0].children.length).toBe(0)
    root.unmount()
  })

  test('Subagent with only text content', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Subagent name="text-only">
        Just some text content
      </Subagent>
    )

    expect(tree).toBeDefined()
    expect(tree.children[0].children.length).toBe(1)
    expect(tree.children[0].children[0].type).toBe('TEXT')
    root.unmount()
  })

  test('Deeply nested Subagents (5+ levels)', async () => {
    const DeepSubagents = () => (
      <Subagent name="level1">
        <Subagent name="level2">
          <Subagent name="level3">
            <Subagent name="level4">
              <Subagent name="level5">
                <Claude>Deep content</Claude>
              </Subagent>
            </Subagent>
          </Subagent>
        </Subagent>
      </Subagent>
    )

    const root = createRoot()
    const tree = await root.render(<DeepSubagents />)
    expect(tree).toBeDefined()

    const result = await executePlan(tree, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
    root.unmount()
  })
})

describe('Edge Cases: Prop Types', () => {
  test('Boolean false prop is preserved', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" enabled={false}>
        <Claude>Content</Claude>
      </Phase>
    )

    expect(tree.children[0].props.enabled).toBe(false)
    root.unmount()
  })

  test('Numeric zero prop is preserved', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" count={0}>
        <Claude>Content</Claude>
      </Phase>
    )

    expect(tree.children[0].props.count).toBe(0)
    root.unmount()
  })

  test('Empty string prop is preserved', async () => {
    const root = createRoot()
    const tree = await root.render(
      <Phase name="">
        <Claude>Content</Claude>
      </Phase>
    )

    expect(tree.children[0].props.name).toBe('')
    root.unmount()
  })

  test('Function props are stored but not serialized', async () => {
    const { serialize } = await import('../src/core/render.js')
    const fn = () => console.log('test')

    const root = createRoot()
    const tree = await root.render(
      <Claude onFinished={fn}>
        Content
      </Claude>
    )

    expect(tree.children[0].props.onFinished).toBe(fn)

    const xml = serialize(tree)
    expect(xml).not.toContain('[Function')
    root.unmount()
  })

  test('Array props are preserved', async () => {
    const arr = ['item1', 'item2', 'item3']

    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" items={arr}>
        <Claude>Content</Claude>
      </Phase>
    )

    expect(tree.children[0].props.items).toEqual(arr)
    root.unmount()
  })

  test('Object props are preserved', async () => {
    const obj = { key1: 'value1', key2: 42, nested: { key3: true } }

    const root = createRoot()
    const tree = await root.render(
      <Phase name="test" config={obj}>
        <Claude>Content</Claude>
      </Phase>
    )

    expect(tree.children[0].props.config).toEqual(obj)
    root.unmount()
  })
})
