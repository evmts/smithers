/**
 * The same render in local workerd as in Node.
 *
 * workerd refuses to compile WebAssembly from bytes, so this Worker names a
 * QuickJS module its toolchain compiled through `QuickJSVariant.layerVariant`.
 * Everything else, the checker, the realm and the bundle, is the code Node
 * and the browser run, and each render here must match Node's byte for byte.
 */
import { Effect } from "effect"
import type { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bundle } from "./fixtures/bundle.ts"
import { comparison, emptyBoard, ticTacToe } from "./fixtures/modules.ts"
import { checked, withRealm } from "./fixtures/realm.ts"
import { start } from "./fixtures/workerd.ts"

let workerd: Miniflare

beforeAll(async () => {
  workerd = await start(await bundle())
}, 60_000)

afterAll(async () => {
  await workerd?.dispose()
})

interface Job {
  readonly source: string
  readonly props: unknown
  readonly state: unknown
  readonly event?: { readonly name: string; readonly arg?: string }
}

const inWorkerd = async (job: Job) => {
  const response = await workerd.dispatchFetch("http://views/", { method: "POST", body: JSON.stringify(job) })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

const inNode = (job: Job) =>
  withRealm((realm) =>
    Effect.gen(function*() {
      const module = checked(job.source)
      const html = yield* realm.render({ module, props: job.props, state: job.state })
      const interacted = job.event === undefined
        ? undefined
        : yield* realm.interact({ module, props: job.props, state: job.state, event: job.event })
      return { html, interacted }
    })
  )

describe("PresentationRealm in workerd", () => {
  const jobs: ReadonlyArray<Job> = [
    { source: ticTacToe, props: { title: "Game" }, state: emptyBoard, event: { name: "cell", arg: "4" } },
    {
      source: comparison,
      props: { rows: [{ name: "Postgres", kind: "server" }, { name: "DuckDB", kind: "embedded" }] },
      state: null
    }
  ]

  for (const job of jobs) {
    it(`renders ${job.source.slice(0, 40).replace(/\s+/g, " ")}… exactly as Node does`, async () => {
      const [worker, node] = await Promise.all([inWorkerd(job), inNode(job)])
      expect(worker.status).toBe(200)
      expect(worker.body).toEqual(JSON.parse(JSON.stringify(node)))
    })
  }

  it("bounds a render inside workerd too", async () => {
    const { body, status } = await inWorkerd({
      source: "export default function View() { for (;;) {} }",
      props: {},
      state: null
    })
    expect(status).toBe(422)
    expect(body.error).toMatchObject({ _tag: "@smthrs/views/RealmError", reason: "limit_exceeded" })
  })

  it("stops recursion inside workerd and still renders the next request", async () => {
    const { body, status } = await inWorkerd({
      source: "export default function View() { function deep(n) { return deep(n + 1) + 1 } return <p>{deep(0)}</p> }",
      props: {},
      state: null
    })
    expect(status).toBe(422)
    expect(body.error).toMatchObject({ reason: "limit_exceeded", limit: "stack" })
    expect((await inWorkerd(jobs[1]!)).status).toBe(200)
  })

  it("refuses a module the checker refuses, inside workerd too", async () => {
    const { body, status } = await inWorkerd({ source: "export default () => <script />", props: {}, state: null })
    expect(status).toBe(422)
    expect(body.error).toMatchObject({ _tag: "@smthrs/views/ViewCodeError", reason: "refused" })
  })
})
