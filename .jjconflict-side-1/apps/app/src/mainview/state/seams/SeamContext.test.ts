import { describe, expect, test } from "bun:test"
import { refusalLead } from "@smthrs/rpc/RefusalCopy"
import { refusalOf } from "@smthrs/rpc/Refusal"
import { FEATURE_NOT_AVAILABLE, isFeatureGateRefusal, refusalWords, readErrorMessage, readGitHubRefusal } from "./SeamContext"

/*
 * §28.5: no debug string is ever visible to a user. An upstream's raw body is
 * plumbing — a router's "404 page not found", an HTML error page, a stack
 * trace — and only a message the upstream addressed to a person (a JSON
 * `message` or `error` field) may reach the screen.
 */

const body = (text: string, contentType?: string, status = 404): Response =>
  new Response(text, {
    status,
    headers: contentType === undefined ? undefined : { "content-type": contentType }
  })

describe("readErrorMessage surfaces only what was written for a person", () => {
  test("a JSON message field is the message", async () => {
    expect(await readErrorMessage(body(JSON.stringify({ message: "no such key" })), "fallback")).toBe(
      "no such key"
    )
  })

  test("a JSON error field is the message when there is no message field", async () => {
    expect(await readErrorMessage(body(JSON.stringify({ error: "rate limited" })), "fallback")).toBe(
      "rate limited"
    )
  })

  test("a router's plain-text 404 never reaches the user", async () => {
    expect(await readErrorMessage(body("404 page not found"), "Your provider keys couldn't be listed right now.")).toBe(
      "Your provider keys couldn't be listed right now."
    )
  })

  test("an HTML error page never reaches the user", async () => {
    expect(
      await readErrorMessage(body("<!doctype html><title>502 Bad Gateway</title>", "text/html"), "fallback")
    ).toBe("fallback")
  })

  test("a JSON body with no message or error field falls back", async () => {
    expect(await readErrorMessage(body(JSON.stringify({ code: 17 })), "fallback")).toBe("fallback")
  })

  test("an empty body falls back", async () => {
    expect(await readErrorMessage(body(""), "fallback")).toBe("fallback")
  })

  test("a long message is bounded", async () => {
    const long = "x".repeat(1000)
    const message = await readErrorMessage(body(JSON.stringify({ message: long })), "fallback")
    expect(message.length).toBe(240)
  })
})

describe("a refusal that is not the reader's to fix speaks in product words", () => {
  test("a 5xx body's words never reach the reader; what failed and whose fault it was do", async () => {
    const raw = JSON.stringify({ message: "pq: relation \"issues\" does not exist" })
    const line = await readErrorMessage(body(raw, "application/json", 500), "Reading issues failed (500)")
    expect(line).toBe(`Reading issues failed (500). ${refusalLead(refusalOf({ body: {}, status: 500, message: "" }))}`)
    expect(line).not.toContain("pq:")
  })

  test("a Worker code is mapped to its written lead, not the Worker's words", async () => {
    const raw = JSON.stringify({ status: "error", code: "request_body_too_large", message: "body 9000000 > limit 8388608" })
    const line = await readErrorMessage(body(raw, "application/json", 413), "Saving the page failed.")
    const refusal = refusalOf({ body: JSON.parse(raw), status: 413, message: "" })
    expect(line).toBe(`Saving the page failed. ${refusalLead(refusal)}`)
    expect(line).not.toContain("8388608")
  })

  test("refusalWords keeps words only for a status the reader can act on", () => {
    expect(refusalWords({ message: "No such branch." }, "fallback", 404)).toBe("No such branch.")
    expect(refusalWords({ message: "segfault" }, "fallback", 502)).toBe("fallback")
    expect(refusalWords({ message: "segfault" }, "fallback", null)).toBe("fallback")
    expect(refusalWords({ code: "request_body_too_large", message: "limit 8388608" }, "fallback", 413)).toBe("fallback")
  })

  test("a GitHub refusal names the rate limit but never a 5xx body", async () => {
    const limited = await readGitHubRefusal(new Response(JSON.stringify({ code: "github_rate_limited", message: "API rate limit exceeded", limit: 5000, remaining: 0, reset_at: "2026-01-01T00:00:00Z" }), { status: 429 }), "fallback")
    expect(limited.rateLimit).toEqual({ limit: 5000, remaining: 0, resetAt: "2026-01-01T00:00:00Z" })
    expect(limited.line).not.toContain("API rate limit exceeded")
    const broken = await readGitHubRefusal(new Response(JSON.stringify({ message: "secondary: upstream EOF" }), { status: 502 }), "Reading pull requests failed (502)")
    expect(broken.line).not.toContain("upstream EOF")
    expect(broken.line.startsWith("Reading pull requests failed (502).")).toBe(true)
  })
})

/*
 * `middleware.FeatureFlagGate` writes HTTP 403 and plue's own envelope:
 * `{"code":"forbidden","class":"permission","fault":"user","message":"feature
 * not available"}` (`pkg/errors.WriteError`, `registry.go` `CodeForbidden`).
 * `APIError.Code` is documented as always present and as the field clients
 * branch on, and `isCloudScopeRefusal` (@smthrs/rpc/UpstreamProse) already
 * classifies plue's sibling gate exactly that way: on the verdict, with the
 * sentence matched WHOLE only because three gates share `forbidden`.
 */
describe("the route-family gate is classified on plue's verdict, never on English alone", () => {
  test("the gate's own answer, and surrounding whitespace forgiven", () => {
    expect(isFeatureGateRefusal(403, FEATURE_NOT_AVAILABLE, "forbidden")).toBe(true)
    expect(isFeatureGateRefusal(403, "  feature not available\n", "forbidden")).toBe(true)
  })

  test("a 403 carrying no verdict never classifies, whatever English it holds", () => {
    expect(isFeatureGateRefusal(403, FEATURE_NOT_AVAILABLE, undefined)).toBe(false)
    expect(isFeatureGateRefusal(403, FEATURE_NOT_AVAILABLE, null)).toBe(false)
    expect(isFeatureGateRefusal(403, FEATURE_NOT_AVAILABLE, "")).toBe(false)
  })

  test("the other refusals that share the forbidden verdict are not this gate", () => {
    for (const message of ["insufficient token scope", "repository-bound token cannot access resources outside its repository", "write access to this repository is required"]) {
      expect(isFeatureGateRefusal(403, message, "forbidden")).toBe(false)
    }
    expect(isFeatureGateRefusal(403, FEATURE_NOT_AVAILABLE, "org_membership_required")).toBe(false)
  })

  test("the sentence is matched whole and in the case the gate writes it", () => {
    for (const message of ["Feature not available", "FEATURE NOT AVAILABLE", "feature not available for this repository", "this feature is not available"]) {
      expect(isFeatureGateRefusal(403, message, "forbidden")).toBe(false)
    }
  })

  test("only a 403 is the gate, and a missing message is never it", () => {
    for (const status of [401, 404, 429, 500, null]) {
      expect(isFeatureGateRefusal(status, FEATURE_NOT_AVAILABLE, "forbidden")).toBe(false)
    }
    expect(isFeatureGateRefusal(403, undefined, "forbidden")).toBe(false)
  })
})
