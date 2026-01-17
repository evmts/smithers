import { describe, test, expect } from 'vitest'
import { createSignal } from '../src/solid-shim'
import { createSmithersRoot } from '../src/root'
import { Ralph } from '../src/components/Ralph'
import { Claude } from '../src/components/Claude'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { serialize } from '../src/serialize'

describe('Integration', () => {
  test('full multi-phase workflow structure', () => {
    const root = createSmithersRoot()

    root.mount(() => {
      const [phase, setPhase] = createSignal<'research' | 'write' | 'done'>('research')

      return (
        <Ralph maxIterations={3}>
          <Phase name={phase()}>
            {phase() === 'research' && (
              <Step>
                <Claude onFinished={() => setPhase('write')}>
                  Research AI agents
                </Claude>
              </Step>
            )}

            {phase() === 'write' && (
              <Step>
                <Claude onFinished={() => setPhase('done')}>
                  Write a report
                </Claude>
              </Step>
            )}

            {phase() === 'done' && <div>Complete!</div>}
          </Phase>
        </Ralph>
      )
    })

    const tree = root.getTree()
    const xml = serialize(tree)

    // Should have Ralph wrapper
    expect(xml).toContain('<ralph')

    // Should have Phase
    expect(xml).toContain('<phase')

    // Should have initial Claude task
    expect(xml).toContain('<claude')
    expect(xml).toContain('Research AI agents')

    root.dispose()
  })

  test('serialize produces valid XML structure', () => {
    const root = createSmithersRoot()

    root.mount(() => (
      <Ralph>
        <Phase name="demo">
          <Step>
            <Claude model="sonnet">Test task</Claude>
          </Step>
        </Phase>
      </Ralph>
    ))

    const xml = serialize(root.getTree())

    // Verify XML structure
    expect(xml).toContain('<ralph')
    expect(xml).toContain('<phase name="demo">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('<claude')
    expect(xml).toContain('Test task')
    expect(xml).toContain('</claude>')
    expect(xml).toContain('</step>')
    expect(xml).toContain('</phase>')
    expect(xml).toContain('</ralph>')

    root.dispose()
  })
})
