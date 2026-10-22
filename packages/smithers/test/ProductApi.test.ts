import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as ProductApi from "../src/internal/backend/ProductApi.ts"

interface Parameter {
  readonly name: string
  readonly in: string
  readonly required?: boolean
  readonly type?: string | ReadonlyArray<string>
}
interface Operation {
  readonly method: string
  readonly path: string
  readonly operationId: string
  readonly parameters: ReadonlyArray<Parameter>
  /** `json` for a JSON request body, `other` for another media type, `none` for no body. */
  readonly body: "json" | "other" | "none"
  /** What a 2xx answer carries: JSON, another media type, or nothing. */
  readonly success: "json" | "raw" | "none"
}

/**
 * The operations the client was generated from: each one's method, path,
 * parameters and body and answer media types, extracted from the product API
 * spec (`docs/api/openapi.yaml`) before that spec was removed with the Go
 * backend on 2026-10-21, with the OAuth callbacks' missing query contracts
 * corrected alongside the wrappers.
 */
const operations = JSON.parse(
  readFileSync(new URL("./fixtures/product-api-operations.json", import.meta.url), "utf8")
) as ReadonlyArray<Operation>
const generatedOperations = operations.filter((operation) => operation.body !== "other")

const functionName = (id: string) =>
  id.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word, index) =>
    index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join("")

/** A value for `parameter` that needs escaping when it is a string. */
const sample = (parameter: Parameter) => {
  const types = [parameter.type ?? []].flat()
  if (types.includes("integer") || types.includes("number")) return 7
  if (types.includes("boolean")) return true
  return `a b/${parameter.name}?#%`
}

type Call = { readonly via: "request" | "response"; readonly args: ReadonlyArray<unknown> }

const recorder = () => {
  const calls: Array<Call> = []
  const answer = { answered: true }
  const raw = new Response("stream")
  const transport: ProductApi.Transport = {
    request: (...args: Array<unknown>) => {
      calls.push({ via: "request", args })
      return Promise.resolve(answer)
    },
    response: (...args: Array<unknown>) => {
      calls.push({ via: "response", args })
      return Promise.resolve(raw)
    }
  }
  return { calls, transport, answer, raw }
}

const generated = ProductApi as unknown as Record<
  string,
  (transport: ProductApi.Transport, input?: unknown) => Promise<unknown>
>

describe("the generated product API client", () => {
  it("preserves owner reset completion and empty order acknowledgment", async () => {
    const owner = recorder()
    const reset = { old: "a".repeat(40), new: "b".repeat(40) }
    const receipt = { state: "settled" as const }
    owner.transport.request = (...args) => {
      owner.calls.push({ via: "request", args })
      return Promise.resolve(receipt)
    }
    expect(await ProductApi.postApiStackAttentionId(owner.transport, { path: { id: "force/7" }, body: reset })).toBe(
      receipt
    )
    expect(owner.calls).toEqual([{ via: "request", args: ["POST", "/api/stack/attention/force%2F7", reset] }])
    const maintainer = recorder()
    maintainer.transport.request = (...args) => {
      maintainer.calls.push({ via: "request", args })
      return Promise.resolve(null)
    }
    expect(
      await ProductApi.postApiStackAttentionId(maintainer.transport, { path: { id: "order-7" }, body: { revision: 7 } })
    ).toBeNull()
    expect(maintainer.calls).toEqual([{
      via: "request",
      args: ["POST", "/api/stack/attention/order-7", { revision: 7 }]
    }])
  })

  it("exports one function per operation with a JSON or empty request body, and nothing else", () => {
    const expected = generatedOperations.map(({ operationId }) => functionName(operationId)).sort()
    const exported = Object.entries(ProductApi).filter(([, value]) => typeof value === "function").map(([name]) => name)
      .sort()
    expect(exported).toEqual(expected)
  })

  it.each(generatedOperations)(
    "$method $path sends the declared method, escaped path, query and body",
    async (operation) => {
      const { path, method, parameters } = operation
      const pathValues = Object.fromEntries(parameters.filter((p) => p.in === "path").map((p) => [p.name, sample(p)]))
      const queryValues = Object.fromEntries(parameters.filter((p) => p.in === "query").map((p) => [p.name, sample(p)]))
      // Only a required header is the caller's; the transport owns the rest.
      const headers = Object.fromEntries(
        parameters.filter((p) => p.in === "header" && p.required === true).map((p) => [p.name, `key ${p.name}`])
      )
      const sendsHeaders = Object.keys(headers).length > 0
      const body = { operation: operation.operationId }
      const input = {
        ...(Object.keys(pathValues).length > 0 ? { path: pathValues } : {}),
        ...(Object.keys(queryValues).length > 0 ? { query: queryValues } : {}),
        ...(sendsHeaders ? { headers } : {}),
        ...(operation.body === "json" ? { body } : {})
      }
      const { calls, transport, answer, raw } = recorder()
      const result = await generated[functionName(operation.operationId)]!(transport, input)

      const search = new URLSearchParams(Object.entries(queryValues).map(([key, value]) => [key, String(value)]))
      const expectedPath =
        path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(pathValues[name]))) +
        (search.size > 0 ? `?${search}` : "")
      const kind = operation.success
      expect(calls).toEqual([{
        via: kind === "raw" ? "response" : "request",
        args: [
          method.toUpperCase(),
          expectedPath,
          ...(operation.body === "json" ? [body] : sendsHeaders ? [undefined] : []),
          ...(sendsHeaders ? [{ headers }] : [])
        ]
      }])
      expect(result).toBe(kind === "raw" ? raw : kind === "json" ? answer : undefined)
    }
  )

  it("reads Learning evidence through the run-bound callback with escaped identifiers", async () => {
    const { calls, transport, answer } = recorder()
    const result = await ProductApi.getApiGatewaysHostLearningRunEvidence(transport, {
      path: { hostID: "host/1?", runID: "run:7/steer" }
    })
    expect(result).toBe(answer)
    expect(calls).toEqual([{
      via: "request",
      args: [
        "GET",
        "/api/gateways/host%2F1%3F/learning/run%3A7%2Fsteer/evidence"
      ]
    }])
  })

  it("leaves unset query parameters out of the path", async () => {
    const { calls, transport } = recorder()
    const path = { owner: "o", repo: "r", change_id: "c" }
    await ProductApi.getApiReposOwnerRepoChangesChangeIdDiff(transport, { path, query: { whitespace: "ignore" } })
    await ProductApi.getApiReposOwnerRepoChangesChangeIdDiff(transport, { path })
    expect(calls.map((call) => call.args[1])).toEqual([
      "/api/repos/o/r/changes/c/diff?whitespace=ignore",
      "/api/repos/o/r/changes/c/diff"
    ])
  })

  it("rejects when the transport rejects", async () => {
    const failure = new Error("refused")
    const transport: ProductApi.Transport = {
      request: () => Promise.reject(failure),
      response: () => Promise.reject(failure)
    }
    await expect(ProductApi.getApiUserKeys(transport)).rejects.toBe(failure)
    await expect(ProductApi.deleteApiUserKeysId(transport, { path: { id: 4 } })).rejects.toBe(failure)
    await expect(ProductApi.getApiAdminAuditLogs(transport)).rejects.toBe(failure)
  })
})
