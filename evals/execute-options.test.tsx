import { describe, test, expect } from 'bun:test'
import './setup.ts'

import { executePlan, Claude } from '@evmts/smithers'

describe('executePlan options', () => {
  test('mockMode overrides SMITHERS_REAL_MODE', async () => {
    const originalReal = process.env.SMITHERS_REAL_MODE
    const originalMock = process.env.SMITHERS_MOCK_MODE
    const originalKey = process.env.ANTHROPIC_API_KEY

    process.env.SMITHERS_REAL_MODE = 'true'
    process.env.SMITHERS_MOCK_MODE = 'false'
    delete process.env.ANTHROPIC_API_KEY

    try {
      const result = await executePlan(
        <Claude>Say hello</Claude>,
        { mockMode: true }
      )

      expect(String(result.output)).toContain('Smithers')
    } finally {
      if (originalReal === undefined) {
        delete process.env.SMITHERS_REAL_MODE
      } else {
        process.env.SMITHERS_REAL_MODE = originalReal
      }

      if (originalMock === undefined) {
        delete process.env.SMITHERS_MOCK_MODE
      } else {
        process.env.SMITHERS_MOCK_MODE = originalMock
      }

      if (originalKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = originalKey
      }
    }
  })
})
