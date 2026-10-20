// The git loop against the real GitHub (docs/features/issues.md#tests): the App's JWT and an installation token, then
// the real `github/Write`, `github/Apply` and `github/Reconcile` on the Node host over this file's schema, on a scratch
// repository Will owns with the App installed. It never touches `smithersai/*`: a test once posted on smithers#1.
// Each case skips, naming the variables it needs, until they are set:
// - GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY: the Smithers GitHub App, with Issues read and write (decision 0012 question 2);
// - GITHUB_LIVE_REPOSITORY: `owner/name` of the scratch repository the App is installed on;
// - GITHUB_LIVE_USER_TOKEN: a `ghu_` user token of the test account (`codeplanesmithers`), for a person's own write.
import { GitHub } from "@smthrs/integrations"
import { Effect, Exit, Option, Redacted } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { beforeEach, describe, expect, test } from "vitest"
import { runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import * as Apply from "./Apply.ts"
import { DEFAULT_API_URL, repositoryOf } from "./Config.ts"
import * as Reconcile from "./Reconcile.ts"
import * as Store from "./Store.ts"
import { database, keys, reset, signedIn, sql } from "./test/fixtures.ts"
import * as Tokens from "./Tokens.ts"
import * as Write from "./Write.ts"

const runtime = testFile("github_live")

beforeEach(() => reset(runtime))

const env = process.env
const missing = (names: ReadonlyArray<string>) => names.filter((name) => (env[name] ?? "").trim() === "")
const scratch = env["GITHUB_LIVE_REPOSITORY"] ?? ""
// Never a repository of the Smithers organization, whatever the environment says.
const refused = /^smithersai\//i.test(scratch)

const appNeeds = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_LIVE_REPOSITORY"]
const appMissing = missing(appNeeds)
const userMissing = missing([...appNeeds, "GITHUB_LIVE_USER_TOKEN"])
if (appMissing.length > 0) console.warn(`The live GitHub App cases are skipped: set ${appMissing.join(", ")}.`)
if (userMissing.length > 0) console.warn(`The live person's write is skipped: set ${userMissing.join(", ")}.`)
if (refused) console.warn("The live GitHub cases are skipped: GITHUB_LIVE_REPOSITORY may not be a smithersai repository.")

/** The flows' services over the real GitHub and this file's schema. */
const live = async () => {
  const app = await Effect.runPromise(
    GitHub.AppAuth.make({
      appId: env["GITHUB_APP_ID"]!,
      privateKey: Redacted.make(env["GITHUB_APP_PRIVATE_KEY"]!),
      apiBaseUrl: DEFAULT_API_URL,
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  )
  const http = await Effect.runPromise(Effect.service(HttpClient.HttpClient).pipe(Effect.provide(FetchHttpClient.layer)))
  return {
    database: await database(runtime),
    http,
    apiBaseUrl: DEFAULT_API_URL,
    tokens: Tokens.make({ app, keys: Option.some(await keys()), refresh: () => Effect.void }),
  } satisfies Apply.Services
}

const admit = (write: Parameters<typeof Store.insertWrite>[0]) => runtime.runPromise(Store.insertWrite(write))

describe.skipIf(appMissing.length > 0 || refused)("the real GitHub, as the App", () => {
  test("reconciles the scratch repository, opens an issue as the App, and a webhook-style re-read finds it", async () => {
    const repository = repositoryOf(scratch)
    const services = await live()
    const reconciled = await runFlow(Reconcile.Reconcile, { repo: scratch }, Reconcile.registration(services), { maxConnections: 3 })
    expect(reconciled.exit._tag).toBe("Success")
    expect(await sql(runtime, `SELECT private FROM github_repositories`)).toEqual([{ private: expect.any(Boolean) }])
    const writeId = crypto.randomUUID()
    await admit({
      id: writeId,
      repoId: repository.id,
      actorId: "live-test",
      sessionId: null,
      via: "agent",
      payload: { op: "issue/create", title: `Smithers live test ${new Date().toISOString()}`, body: "Opened by the live test." },
      payloadHash: "0".repeat(64),
    })
    const written = await runFlow(Write.Write, { writeId }, Write.registration(services), { maxConnections: 3 })
    expect(written.exit).toEqual(Exit.succeed({ status: "done", itemNumber: expect.any(Number) }))
    const number = (written.exit as Exit.Success<Write.Written, never>).value.itemNumber!
    console.info(`live: opened ${scratch}#${number} as the App (write ${writeId})`)
    const applied = await runFlow(
      Apply.Apply,
      { deliveryId: crypto.randomUUID(), repo: scratch, number, event: "issues" },
      Apply.registration(services),
      { maxConnections: 3 },
    )
    expect(applied.exit).toEqual(Exit.succeed({ outcome: "applied", changed: expect.any(Number) }))
    expect(await sql(runtime, `SELECT author_login AS author, write_id::text AS "writeId" FROM items WHERE number = ${number}`))
      .toEqual([{ author: expect.stringMatching(/\[bot\]$/), writeId }])
  }, 120_000)
})

describe.skipIf(userMissing.length > 0 || refused)("the real GitHub, as a person", () => {
  test("a person's comment shows on GitHub as that person", async () => {
    const repository = repositoryOf(scratch)
    const services = await live()
    const token = Redacted.make(env["GITHUB_LIVE_USER_TOKEN"]!)
    const person = await signedIn(runtime, { login: "codeplanesmithers", token })
    const opened = crypto.randomUUID()
    await admit({
      id: opened,
      repoId: repository.id,
      actorId: person.personId,
      sessionId: person.sessionId,
      via: "person",
      payload: { op: "issue/create", title: `Smithers live test (person) ${new Date().toISOString()}`, body: "As a person." },
      payloadHash: "0".repeat(64),
    })
    const written = await runFlow(Write.Write, { writeId: opened }, Write.registration(services), { maxConnections: 3 })
    expect(written.exit).toEqual(Exit.succeed({ status: "done", itemNumber: expect.any(Number) }))
    const [row] = (await sql(runtime, `SELECT author_login AS author FROM items WHERE write_id = '${opened}'`)) as unknown as [
      { author: string },
    ]
    expect(row.author).not.toMatch(/\[bot\]$/)
  }, 120_000)
})
