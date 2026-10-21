// What an eval run spent and how its table reads (docs/features/agent-evals.md#results).
import { describe, expect, test } from "vitest"
import { trial } from "./fixtures"
import { endpointSpend, judgeSpend, summary } from "./report"

describe("endpointSpend", () => {
  test("adds the endpoint's calls by role, priced at the model's list price", () => {
    const spend = endpointSpend([
      trial({
        usage: [
          { role: "agent", modelId: "qwen-3.8-27b", inputTokens: 1_000_000, outputTokens: 0, chargedTokens: 0 },
          { role: "judge", modelId: "qwen-3.8-27b", inputTokens: 0, outputTokens: 1_000_000, chargedTokens: 0 },
        ],
      }),
      trial({ usage: [{ role: "agent", modelId: "qwen-3.8-27b", inputTokens: 1_000_000, outputTokens: 0, chargedTokens: 0 }] }),
    ])

    // qwen-3.8-27b lists at $0.99 a million input tokens and $1.49 a million output tokens.
    expect(spend.roles["agent"]).toEqual({ calls: 2, inputTokens: 2_000_000, outputTokens: 0, costUsd: 1.98 })
    expect(spend.roles["judge"]).toEqual({ calls: 1, inputTokens: 0, outputTokens: 1_000_000, costUsd: 1.49 })
    expect(spend.total).toEqual({ calls: 3, tokens: 3_000_000, costUsd: expect.closeTo(3.47, 10) })
  })

  test("a model with no list price costs nothing it can name; no trials spend nothing", () => {
    expect(endpointSpend([trial({ usage: [{ role: "agent", modelId: "unpriced", inputTokens: 10, outputTokens: 5, chargedTokens: 0 }] })])
      .total).toEqual({ calls: 1, tokens: 15, costUsd: 0 })
    expect(endpointSpend([])).toEqual({ roles: {}, total: { calls: 0, tokens: 0, costUsd: 0 } })
  })
})

describe("judgeSpend", () => {
  test("takes a reading's own price when it reported one, else its model's list price, and skips none", () => {
    const spend = judgeSpend([
      { inputTokens: 100, outputTokens: 10, modelId: "claude-haiku", costUsd: 0.002 },
      { inputTokens: 1_000_000, outputTokens: 0, modelId: "typesafe-ai/jev" },
      { inputTokens: 5, outputTokens: 5 },
      null,
    ])

    expect(spend.roles["claude-haiku"]).toMatchObject({ calls: 1, costUsd: 0.002 })
    expect(spend.roles["typesafe-ai/jev"]).toMatchObject({ calls: 1, costUsd: 0.042 })
    expect(spend.roles["unknown"]).toMatchObject({ calls: 1, inputTokens: 5, outputTokens: 5 })
    expect(spend.total.calls).toBe(3)
  })
})

describe("summary", () => {
  test("a row per case, then the spend and the time", () => {
    const text = summary({
      cases: [
        {
          name: "theme-dark",
          scores: {
            behavior: { score: 1, reason: "every check passed" },
            safety: { score: 1, reason: "every check passed" },
            judge: { score: 0, reason: "no: words" },
          },
        },
        { name: "greeting", scores: { behavior: { score: null, reason: "scorer failed" } } },
      ],
      endpoint: endpointSpend([trial()]),
      judge: judgeSpend([{ inputTokens: 500, outputTokens: 69, modelId: "typesafe-ai/jev" }]),
      ms: 2_400,
    })

    expect(text.split("\n")).toEqual([
      "| case | behavior | safety | judge |",
      "|---|---|---|---|",
      "| theme-dark | 1 | 1 | 0 (no: words) |",
      "| greeting | ? scorer failed | - | - |",
      "",
      "model endpoint: 1 calls, 6100 tokens, $0.0061",
      "judge: 1 calls, 569 tokens, $0.0000",
      "answers took 2 s",
    ])
  })
})

test('candidate prices override a global model alias and refuse unpriced routes',()=>{
 const trials=[trial({usage:[{role:'agent',modelId:'qwen/qwen3.8-27b',inputTokens:1_000_000,outputTokens:1_000_000,chargedTokens:2_000_000}]})]
 expect(endpointSpend(trials,{modelId:'qwen/qwen3.8-27b',input:.8,output:4}).total.costUsd).toBe(4.8)
 expect(()=>endpointSpend(trials,{modelId:'wrong-provider',input:.8,output:4})).toThrow('Unpriced model')
})
