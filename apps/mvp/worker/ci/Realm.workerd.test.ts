// A repository flow planned in the realm on Cloudflare's runtime (worker/ci/Realm.ts): the test Worker
// (worker/test/workerd/realm.ts), bundled as Alchemy bundles ChatApi, strips the flow's types with sucrase and evaluates it
// in the QuickJS build the bundle carries. workerd holds its clock still while code runs, so only the realm's step budget,
// never its deadline, can stop a loop there: the loop below shows it does.
import type { Miniflare } from "miniflare"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { start } from "../test/workerd/bundle.ts"

const ENTRY = fileURLToPath(new URL("../test/workerd/realm.ts", import.meta.url))

const CI = `
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { CiJob } from "@smthrs/sandbox"

const versions = CiJob.make("versions", { steps: [{ name: "node", run: "node --version" }] })
const fail = CiJob.make("fail", { steps: [{ name: "exit", run: "exit 1" }] })

export default Flow.make("ci", {
  body: (run: { readonly sha: string }) => Node.all({ versions: versions.call(run), fail: fail.call(run) }),
})
`

describe("a repository flow's realm on workerd", () => {
  let worker: Miniflare | undefined

  beforeAll(async () => {
    ;({ worker } = await start(ENTRY, "realm"))
  }, 120_000)

  afterAll(async () => {
    await worker?.dispose()
  })

  const plan = async (source: string) => {
    const response = await worker!.dispatchFetch("http://realm/", { method: "POST", body: source })
    const text = await response.text()
    expect(response.status, text).toBe(200)
    return JSON.parse(text) as unknown
  }

  test("plans a TypeScript flow's jobs", async () => {
    expect(await plan(CI)).toEqual({
      _tag: "planned",
      tag: "ci",
      jobs: [
        { name: "versions", steps: [{ name: "node", run: "node --version" }] },
        { name: "fail", steps: [{ name: "exit", run: "exit 1" }] },
      ],
    })
  }, 60_000)

  test("stops a loop that never ends by its step budget, and refuses an import", async () => {
    expect(await plan(`while (true) {}\n${CI}`)).toEqual({ _tag: "refused", reason: "limit" })
    expect(await plan(`import "node:fs"\n${CI}`)).toEqual({ _tag: "refused", reason: "import" })
  }, 60_000)
})
