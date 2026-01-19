/**
 * Tests for src/core/index.ts
 * The core module is currently a thin re-export layer
 */

import { describe, test } from 'bun:test'

describe('core/index', () => {
  describe('module exports', () => {
    test.todo('exports serialize function from reconciler')
    test.todo('serialize export is a function')
    test.todo('type exports are accessible (SmithersNode, ExecutionState, etc.)')
  })

  describe('serialize re-export', () => {
    test.todo('serialize works correctly when imported from core')
    test.todo('serialize handles SmithersNode input')
    test.todo('serialize returns string output')
  })

  describe('backwards compatibility', () => {
    test.todo('importing from core/index gives same result as reconciler/serialize')
    test.todo('all documented exports are present')
  })
})
