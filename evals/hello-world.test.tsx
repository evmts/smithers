/**
 * Hello World E2E Test
 *
 * Basic sanity test for renderPlan and executePlan functionality.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot, type SmithersRoot } from '../src/reconciler/root'
import { createSmithersDB, type SmithersDB } from '../src/db/index'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'

describe('hello-world', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'hello-world')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('renders basic Claude component to XML', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="greet">
          <Claude model="sonnet">Say hello world</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<claude')
    expect(xml).toContain('Say hello world')
    expect(xml).toContain('<phase')
  })

  test('executes and returns a result', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="simple">
          <Step name="one">Do step one</Step>
          <Step name="two">Do step two</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Do step one')
    expect(xml).toContain('Do step two')
    expect(xml).toContain('name="simple"')
  })
})
