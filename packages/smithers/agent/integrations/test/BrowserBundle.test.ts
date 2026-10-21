/**
 * The root entry runs on every platform: Node, Bun, a browser and a
 * Cloudflare Worker. The repository-clone flow (apps/mvp decision 0006) takes
 * its GitHub client from this root on the Cloudflare host. Crypto is
 * WebCrypto, HTTP is the `HttpClient` the caller provides (here
 * `FetchHttpClient.layer` over the realm's own `fetch`), and the process environment is read
 * only where the host has one, so nothing this root reaches may import a
 * `node:` or `bun:` built-in or touch a Node global.
 *
 * `packages/repo-targets/browser/browser-check.mjs` gates the bundle at the
 * repository level. This file keeps the property attached to the package that
 * owns it, and it also runs the bundle, which a bundle check cannot do: in a
 * realm that holds only web-standard globals, with no `process`, `Buffer` or
 * `require`.
 */
import { build } from "esbuild"
import { createHash, createHmac } from "node:crypto"
import { fileURLToPath } from "node:url"
import { createContext, runInContext } from "node:vm"
import vibelang from "vibelang-unplugin/esbuild"
import { afterEach, describe, expect, it } from "vitest"
import { type Fixture, json, startFixture } from "./Fixture.ts"

const root = fileURLToPath(new URL("..", import.meta.url))
const conditions = ["workerd", "worker", "browser", "import", "default"]
// The root reaches @smthrs/errors, whose source is VibeLang.
const plugins = [vibelang({ root })]

/** The root entry, plus the `effect` modules a caller runs it with. */
type Realm =
  & typeof import("../src/index.ts")
  & Pick<typeof import("effect"), "Effect" | "Redacted">
  & Pick<typeof import("effect/http"), "FetchHttpClient">
  & {
    /** The realm's own answer to `typeof` for the Node globals it must lack. */
    readonly nodeGlobals: string
  }

/**
 * What a browser and a Worker both provide. Everything else, `process`,
 * `Buffer`, `require` and `setImmediate` among it, is absent from the realm.
 */
const webGlobals = () => ({
  AbortController,
  AbortSignal,
  DOMException,
  Event,
  EventTarget,
  Headers,
  ReadableStream,
  Request,
  Response,
  TextDecoder,
  TextEncoder,
  URL,
  URLSearchParams,
  atob,
  btoa,
  clearInterval,
  clearTimeout,
  console,
  crypto,
  fetch,
  performance,
  queueMicrotask,
  setInterval,
  setTimeout,
  structuredClone
})

/** Bundles the root for a browser and a Worker, then evaluates it in a web-only realm. */
const loadRealm = async (): Promise<Realm> => {
  const result = await build({
    stdin: {
      contents: [
        `export * from "./src/index.ts"`,
        `export { Effect, Redacted } from "effect"`,
        `export { FetchHttpClient } from "effect/http"`
      ].join("\n"),
      resolveDir: root,
      sourcefile: "realm.ts",
      loader: "ts"
    },
    bundle: true,
    platform: "browser",
    conditions,
    format: "iife",
    globalName: "realm",
    target: "es2022",
    plugins,
    write: false,
    logLevel: "silent"
  })
  const context = createContext(webGlobals())
  runInContext(result.outputFiles[0]!.text, context)
  // Asked of the realm, not inside the bundle, where esbuild shims `require`.
  const nodeGlobals = runInContext(
    "[typeof process, typeof Buffer, typeof require, typeof setImmediate].join()",
    context
  )
  return { ...(context as unknown as { readonly realm: Realm }).realm, nodeGlobals }
}

const base64url = (bytes: Buffer) => bytes.toString("base64url")

let fixture: Fixture | undefined

afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})

describe("the root entry", () => {
  it("bundles for the browser and a Worker without a node: or bun: built-in", async () => {
    const result = await build({
      entryPoints: [`${root}src/index.ts`],
      bundle: true,
      platform: "browser",
      conditions,
      format: "esm",
      plugins,
      write: false,
      logLevel: "silent",
      metafile: true
    })
    const imported = Object.values(result.metafile.inputs).flatMap(({ imports }) => imports.map(({ path }) => path))
    expect(imported.filter((path) => /^(?:node|bun):/.test(path))).toEqual([])
  })

  it("runs OAuth PKCE, a GitHub call and webhook verification with only web-standard globals", async () => {
    const { Core, Effect, FetchHttpClient, GitHub, nodeGlobals, Redacted } = await loadRealm()
    expect(nodeGlobals).toBe("undefined,undefined,undefined,undefined")

    const pair = await Effect.runPromise(Core.Pkce.createPkcePair())
    expect(pair.codeChallenge).toBe(base64url(createHash("sha256").update(pair.codeVerifier).digest()))
    const authorize = new URL(Core.AuthorizationUrl.buildAuthorizationUrl({
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      clientId: "client-1",
      redirectUri: "https://app.example/callback",
      state: "state-1",
      codeChallenge: pair.codeChallenge
    }))
    expect(authorize.searchParams.get("code_challenge")).toBe(pair.codeChallenge)

    fixture = await startFixture((request, response) =>
      request.url === "/login/oauth/access_token"
        ? json(response, 200, { access_token: "gho_minted", token_type: "bearer" })
        : json(response, 200, { login: "octocat" })
    )
    const grant = await Effect.runPromise(Effect.provide(
      Core.OAuthToken.exchangeCode({
        tokenUrl: `${fixture.origin}/login/oauth/access_token`,
        clientId: "client-1",
        clientSecret: Redacted.make("client-secret"),
        clientAuthentication: "basic",
        code: Redacted.make("code-1"),
        redirectUri: "https://app.example/callback",
        codeVerifier: Redacted.make(pair.codeVerifier)
      }),
      FetchHttpClient.layer
    ))
    const exchange = fixture.requests[0]!
    expect(exchange.headers["authorization"]).toBe(`Basic ${Buffer.from("client-1:client-secret").toString("base64")}`)
    expect(new URLSearchParams(exchange.body).get("code_verifier")).toBe(pair.codeVerifier)

    // No `env` argument: the client reads the ambient environment, and a host
    // without one must leave it empty rather than throw.
    const viewer = Effect.flatMap(
      GitHub.GitHubClient.make({ token: Redacted.value(grant.accessToken), apiBaseUrl: fixture.origin }),
      (client) => client.request("GET", "/user")
    )
    // An object made in the realm carries the realm's prototypes, so it is copied out before comparing.
    expect({ ...(await Effect.runPromise(Effect.provide(viewer, FetchHttpClient.layer)) as object) })
      .toEqual({ login: "octocat" })
    expect(fixture.requests[1]!.headers["authorization"]).toBe("Bearer gho_minted")

    const body = JSON.stringify({ action: "opened" })
    const signature = `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`
    const verify = (payload: string) =>
      Effect.runPromise(Core.Signature.verifySignature({ payload, secret: "webhook-secret", signature }))
    expect(await verify(body)).toBe(true)
    expect(await verify(`${body} `)).toBe(false)
  })
})
