import { describe, test, expect } from 'bun:test'
import { validateRewrite } from './rewriter.js'

describe('validateRewrite', () => {
  test('rejects code with useState', async () => {
    const code = `
      import { useState } from 'react'
      export default function Plan() {
        const [x, setX] = useState(0)
        return null
      }
    `
    const result = await validateRewrite(code, '/test/plan.tsx')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('useState')
  })

  test('rejects code with relative imports', async () => {
    const code = `
      import { helper } from './helpers'
      export default function Plan() {
        return null
      }
    `
    const result = await validateRewrite(code, '/test/plan.tsx')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('relative import')
  })

  test('rejects code with parent relative imports', async () => {
    const code = `
      import { util } from '../utils/common'
      export default function Plan() {
        return null
      }
    `
    const result = await validateRewrite(code, '/test/plan.tsx')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('relative import')
  })

  test('accepts code with package imports', async () => {
    const code = `
      import { useRef } from 'react'
      import { useSmithers } from 'smithers-orchestrator/components'
      export default function Plan() {
        const ref = useRef(null)
        return null
      }
    `
    const result = await validateRewrite(code, '/test/plan.tsx')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test('rejects code with syntax errors', async () => {
    const code = `
      export default function Plan( {
        return null
      }
    `
    const result = await validateRewrite(code, '/test/plan.tsx')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Syntax error')
  })
})
