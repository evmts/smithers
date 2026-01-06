import { describe, test, expect } from 'bun:test'
import './setup.ts'
import * as path from 'path'

import { loadAgentFile, renderPlan } from '../src/index.js'

describe('props handling', () => {
  test('loadAgentFile applies props to component exports', async () => {
    const fixturePath = path.resolve(import.meta.dir, 'fixtures/props-agent.tsx')
    const element = await loadAgentFile(fixturePath, {
      props: { name: 'Ada' },
    })
    const plan = await renderPlan(element)

    expect(plan).toContain('Ada')
  })
})
