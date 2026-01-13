import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { createSignal, type JSX } from 'solid-js'
import {
  Claude,
  ClaudeApi,
  Human,
  Phase,
  Step,
  Subagent,
  createComponent,
  createSmithersSolidRoot,
} from '../dist/index.js'
import { executePlan, type ExecuteOptions } from '@evmts/smithers-core'

setDefaultTimeout(120_000)

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY)
const runRealE2e = process.env.SMITHERS_E2E_REAL === 'true' && hasApiKey
const testReal = runRealE2e ? test : test.skip

if (process.env.SMITHERS_E2E_REAL === 'true' && !hasApiKey) {
  console.warn('SMITHERS_E2E_REAL is true but ANTHROPIC_API_KEY is missing; skipping real-model evals.')
}

const apiModel = process.env.SMITHERS_E2E_API_MODEL ?? 'claude-3-5-haiku-20241022'
const agentModel =
  (process.env.SMITHERS_E2E_AGENT_MODEL as 'haiku' | 'sonnet' | 'opus' | 'inherit' | undefined) ??
  'haiku'

const runSerial = (() => {
  let chain = Promise.resolve()
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn)
    chain = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
})()

async function executeSolid(App: () => JSX.Element, options: ExecuteOptions = {}) {
  const root = createSmithersSolidRoot()
  root.mount(App)
  await root.flush()

  try {
    return await executePlan(root.getTree(), {
      maxFrames: 6,
      mockMode: false,
      ...options,
      rerender: async () => {
        await root.flush()
        return root.getTree()
      },
    })
  } finally {
    root.dispose()
  }
}

function testSerial(name: string, fn: () => Promise<void>) {
  testReal(name, () => runSerial(fn))
}

describe('solid real-model e2e', () => {
  testSerial('executes Claude via Solid renderer', async () => {
    const result = await executeSolid(() =>
      createComponent(Claude, { model: agentModel, maxTurns: 1, allowedTools: [] }, () =>
        'Reply with the single word "ok".'
      )
    )

    expect(String(result.output).toLowerCase()).toMatch(/\bok\b/)
  })

  testSerial('executes ClaudeApi via Solid renderer', async () => {
    const result = await executeSolid(() =>
      createComponent(ClaudeApi, { model: apiModel, maxTokens: 64 }, () =>
        'Reply with the single word "pong".'
      )
    )

    expect(String(result.output).toLowerCase()).toMatch(/\bpong\b/)
  })

  testSerial('solid signals trigger re-rendered frames', async () => {
    const outputs: string[] = []
    const [phase, setPhase] = createSignal<'first' | 'second'>('first')

    const App = () => {
      if (phase() === 'first') {
        return createComponent(
          ClaudeApi,
          {
            model: apiModel,
            maxTokens: 64,
            onFinished: (output: unknown) => {
              outputs.push(String(output))
              setPhase('second')
            },
          },
          () => 'Reply with the single word "first".'
        )
      }

      return createComponent(
        ClaudeApi,
        {
          model: apiModel,
          maxTokens: 64,
          onFinished: (output: unknown) => {
            outputs.push(String(output))
          },
        },
        () => 'Reply with the single word "second".'
      )
    }

    const result = await executeSolid(App, { maxFrames: 4 })

    expect(outputs).toHaveLength(2)
    expect(outputs[0].toLowerCase()).toMatch(/\bfirst\b/)
    expect(outputs[1].toLowerCase()).toMatch(/\bsecond\b/)
    expect(String(result.output).toLowerCase()).toMatch(/\bsecond\b/)
  })

  testSerial('executes parallel subagents', async () => {
    const outputs: string[] = []

    const result = await executeSolid(() =>
      createComponent(
        Subagent,
        { parallel: true },
        () => [
          createComponent(
            ClaudeApi,
            {
              model: apiModel,
              maxTokens: 64,
              onFinished: (output: unknown) => outputs.push(String(output)),
            },
            () => 'Reply with the single word "left".'
          ),
          createComponent(
            ClaudeApi,
            {
              model: apiModel,
              maxTokens: 64,
              onFinished: (output: unknown) => outputs.push(String(output)),
            },
            () => 'Reply with the single word "right".'
          ),
        ]
      )
    )

    const joined = outputs.join(' ').toLowerCase()
    expect(joined).toContain('left')
    expect(joined).toContain('right')
    expect(String(result.output).length).toBeGreaterThan(0)
  })

  testSerial('human gate auto-approves and advances execution', async () => {
    const outputs: string[] = []
    const [approved, setApproved] = createSignal(false)

    const App = () =>
      approved()
        ? createComponent(
            ClaudeApi,
            {
              model: apiModel,
              maxTokens: 64,
              onFinished: (output: unknown) => outputs.push(String(output)),
            },
            () => 'Reply with the single word "approved".'
          )
        : createComponent(Human, { message: 'Approve to continue', onApprove: () => setApproved(true) }, () => undefined)

    const result = await executeSolid(App, { maxFrames: 4 })

    expect(approved()).toBe(true)
    expect(outputs).toHaveLength(1)
    expect(outputs[0].toLowerCase()).toMatch(/\bapproved\b/)
    expect(String(result.output).toLowerCase()).toMatch(/\bapproved\b/)
  })

  testSerial('phase and step content round-trips in prompts', async () => {
    const plan = createComponent(
      Phase,
      { name: 'validation' },
      () =>
        createComponent(Step, {}, () => 'Return the word plan-ok')
    )

    const result = await executeSolid(() =>
      createComponent(
        ClaudeApi,
        { model: apiModel, maxTokens: 64 },
        () => [plan, 'Reply with the single word "plan-ok".']
      )
    )

    expect(String(result.output).toLowerCase()).toMatch(/\bplan-ok\b/)
  })
})
