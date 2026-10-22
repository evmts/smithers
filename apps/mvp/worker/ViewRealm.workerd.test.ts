// worker/ViewRealm.ts in local workerd: ChatApi's presentation realm renders a generated view and makes a move on
// Cloudflare's runtime. The test Worker (worker/test/workerd/views.ts) is bundled as Alchemy bundles ChatApi, so it
// proves `@smthrs/ui`'s presentation bundle and QuickJS's compiled `.wasm` load in the Worker (worker/test/workerd/bundle.ts).
import type { Miniflare } from "miniflare"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { start } from "./test/workerd/bundle.ts"

const ENTRY = fileURLToPath(new URL("./test/workerd/views.ts", import.meta.url))

describe("ChatApi's presentation realm on workerd", () => {
  let worker: Miniflare | undefined
  let wasm: Array<string> = []

  beforeAll(async () => {
    const started = await start(ENTRY, "views")
    worker = started.worker
    wasm = started.wasm
  }, 120_000)

  afterAll(async () => {
    await worker?.dispose()
  })

  test("the bundle carries QuickJS as one compiled WebAssembly module", () => {
    expect(wasm).toHaveLength(1)
  })

  test("renders the tic-tac-toe board, makes a move, and refuses a module that throws", async () => {
    const response = await worker!.dispatchFetch("http://views/")
    const text = await response.text()
    expect(response.status, text).toBe(200)
    const played = JSON.parse(text) as {
      readonly html: string
      readonly moved: { readonly state: { readonly cells: ReadonlyArray<string> }; readonly html: string }
      readonly refused: string
      readonly interactions: unknown
    }
    expect(played.html).toContain(`data-event="cell:4"`)
    expect(played.html).toContain("X to move")
    expect(played.moved.state.cells[4]).toBe("X")
    expect(played.moved.html).toContain("O to move")
    expect(played.refused).toBe("render_failed")
    expect(played.interactions).toEqual({ cell: { kind: "state" }, reset: { kind: "state" } })
  }, 60_000)
})
