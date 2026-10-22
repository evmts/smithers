// The production hostname a deploy reads (infra/Domain.ts) and the docs site's routes on it (infra/DocsSite.ts).
import { ConfigProvider, Effect, Exit, Option } from "effect"
import { describe, expect, test } from "vitest"
import { DOCS_SITE } from "../src/pwa.ts"
import { AppDomain, AppDomainInvalid, docsRoutes, WORKERS_DEV } from "./Domain.ts"

const provided = <A, E>(effect: Effect.Effect<A, E>, env: Record<string, string>) =>
  effect.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))))

const read = (env: Record<string, string>) => Effect.runSyncExit(provided(AppDomain, env))

const refusal = (env: Record<string, string>) => {
  const error = Effect.runSync(provided(Effect.flip(AppDomain), env))
  if (!(error instanceof AppDomainInvalid)) throw new Error(`APP_DOMAIN ${JSON.stringify(env)} failed otherwise`)
  return error
}

describe("APP_DOMAIN", () => {
  test("names the custom domain a production deploy attaches the app to", () => {
    expect(read({ APP_DOMAIN: "example.com" })).toEqual(Exit.succeed(Option.some("example.com")))
    expect(read({ APP_DOMAIN: "app.example.co.uk" })).toEqual(Exit.succeed(Option.some("app.example.co.uk")))
  })

  test("workers.dev deploys with no custom domain", () => {
    expect(read({ APP_DOMAIN: WORKERS_DEV })).toEqual(Exit.succeed(Option.none()))
  })

  test("unset or empty, it stops the deploy and says what to set", () => {
    expect(refusal({ APP_DOMAIN: "" }).value).toBeUndefined()
    const error = refusal({})
    expect(error.value).toBeUndefined()
    expect(error.message).toBe(
      "APP_DOMAIN is unset. Set it to the hostname the app serves at, such as example.com, or to workers.dev to serve " +
        "it only at its workers.dev URL (docs/infrastructure.md#domain).",
    )
  })

  test("refuses anything but a lowercase hostname, and says which value", () => {
    for (const value of [
      "https://example.com",
      "example.com/",
      "example.com:443",
      "Example.com",
      "localhost",
      "-example.com",
      "example..com",
      "*.example.com",
      `${"a".repeat(64)}.com`,
    ]) {
      const error = refusal({ APP_DOMAIN: value })
      expect(error.value).toBe(value)
      expect(error.message).toBe(
        `APP_DOMAIN is "${value}": it must be a hostname such as example.com, with no scheme, port or path, or ` +
          "workers.dev (docs/infrastructure.md#domain).",
      )
    }
  })
})

describe("the docs site's routes", () => {
  test("claim each of its paths on the domain, and only those", () => {
    const routes = docsRoutes("example.com")
    expect(routes).toContainEqual({ pattern: "example.com/docs" })
    expect(routes).toContainEqual({ pattern: "example.com/docs/*" })
    expect(routes).toContainEqual({ pattern: "example.com/llms.txt*" })
    for (const { pattern } of routes) {
      // Cloudflare takes `*` only at a route path's end, and refuses a query in one.
      expect(pattern).toMatch(/^example\.com\/[^*?]*\*?$/)
      expect(DOCS_SITE.test(pattern.slice("example.com".length).replace(/\*$/, ""))).toBe(true)
    }
    expect(new Set(routes.map(({ pattern }) => pattern)).size).toBe(routes.length)
  })
})
