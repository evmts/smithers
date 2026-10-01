/*
 * The models controller at the composition root: the `model.*` flows reach it
 * through the one command map, and a test the card still holds as requested is
 * launched again after identity loads, so boot cannot supersede its result.
 */
import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { APP_SCHEMA_VERSION } from "../chain/SchemaVersion"
import { openSqliteRowStorage, ROW_TABLE_NAME } from "../chain/SqliteRowStorage"
import { MODEL_CATALOG_PATH, MODEL_TEST_PATH } from "@smthrs/rpc/AgentApiRoutes"
import type { ConfiguredModel, ModelCatalog, ModelTestResult } from "@smthrs/rpc/ConfiguredModel"
import { createAppStore, PERSISTED_COLLECTION_SPECS } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"
import { MODELS_CARD_ID } from "./controller/models"
import { memoryStorage, unavailableAgent, waitFor } from "./TestFixtures"

const createAppController = scopedControllers()
const releasePending: Array<() => void> = []
afterEach(() => { for (const release of releasePending.splice(0)) release() })

const mine: ConfiguredModel = { id: "mine", protocol: "openai-chat", baseUrl: "https://api.cerebras.ai", modelId: "qwen-3-coder-480b", credential: "CEREBRAS_API_KEY" }
const catalog: ModelCatalog = { models: [], credentials: [{ name: "CEREBRAS_API_KEY", present: true, origins: ["https://api.cerebras.ai"] }], seats: ["explainer"] }
const passed: ModelTestResult = { ok: true, latencyMs: 12, sample: "ok" }

const host = () => {
  const paths: Array<string> = []
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    const path = new URL(input instanceof Request ? input.url : String(input), "http://local.test").pathname
    paths.push(path)
    return Response.json(path === MODEL_TEST_PATH ? passed : path === MODEL_CATALOG_PATH ? catalog : {})
  }
  return { paths, fetchImpl }
}

const modelsCard = (store: Awaited<ReturnType<typeof createAppStore>>) => {
  const card = store.collections.cards.get(MODELS_CARD_ID)
  return card?.kind === "models" ? card : undefined
}

test("the model flows run through the registry, and a requested test survives a reload", async () => {
  const storage = memoryStorage()
  const first = await createAppStore({ kind: "localStorage", storage })
  // A host held through disposal: the request is all the first session leaves behind.
  const held = Promise.withResolvers<Response>()
  releasePending.push(() => held.resolve(Response.json(passed)))
  const silent = createAppController(first, unavailableAgent, {
    fetchImpl: (input) => new URL(input instanceof Request ? input.url : String(input), "http://local.test").pathname === MODEL_TEST_PATH
      ? held.promise
      : Promise.resolve(Response.json(catalog))
  })
  expect(await silent.commands.run("model.save", "--name mine --protocol openai-chat --model qwen-3-coder-480b --credential CEREBRAS_API_KEY --url https://api.cerebras.ai")).toEqual({ status: "executed", value: "saved mine" })
  expect(first.collections.models.get("mine")).toMatchObject(mine)
  expect(await silent.commands.run("model.test", "mine")).toEqual({ status: "executed", value: "Requested" })
  expect(modelsCard(first)?.payload.testing).toEqual(["mine"])
  await silent.dispose()
  await first.dispose?.()

  const second = await createAppStore({ kind: "localStorage", storage })
  expect(modelsCard(second)?.payload.testing).toEqual(["mine"])
  const answering = host()
  const reloaded = createAppController(second, unavailableAgent, { fetchImpl: answering.fetchImpl })
  expect(answering.paths).toEqual([])
  await reloaded.loadSession()
  await waitFor(() => second.collections.models.get("mine")?.lastTest !== undefined)
  expect(answering.paths).toContain(MODEL_TEST_PATH)
  expect(second.collections.models.get("mine")?.lastTest?.result).toEqual(passed)
  expect(modelsCard(second)?.payload.testing).toEqual([])
})

test("a user command restores the transcript before rendering over a stale maximized card", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const answering = host()
  const controller = createAppController(store, unavailableAgent, { fetchImpl: answering.fetchImpl })

  await controller.commands.run("model.save", "--name mine --protocol openai-chat --model qwen-3-coder-480b --credential CEREBRAS_API_KEY --url https://api.cerebras.ai")
  await controller.commands.run("card.maximize", MODELS_CARD_ID)
  expect(store.session().maximizedCardId).toBe(MODELS_CARD_ID)

  await controller.commands.run("model.save", "--name second --protocol openai-chat --model qwen-3-coder-480b --credential CEREBRAS_API_KEY --url https://api.cerebras.ai")
  expect(store.session().maximizedCardId).toBeNull()
  expect(store.collections.models.has("second")).toBe(true)

  await controller.dispose()
  await store.dispose?.()
})

test("chrome commands and the card's own history keep a maximized card in place", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const answering = host()
  const controller = createAppController(store, unavailableAgent, { fetchImpl: answering.fetchImpl })

  await controller.commands.run("model.save", "--name mine --protocol openai-chat --model qwen-3-coder-480b --credential CEREBRAS_API_KEY --url https://api.cerebras.ai")
  await controller.commands.run("card.maximize", MODELS_CARD_ID)
  for (const [name, args] of [["chat.open"], ["palette.open"], ["appearance.dark-mode"], ["input.mode", "vim"], ["card.history.back", MODELS_CARD_ID]] as const) {
    await controller.commands.run(name, args)
    expect(store.session().maximizedCardId).toBe(MODELS_CARD_ID)
  }
  expect(store.session().inputMode).toBe("vim")

  // Without its input the same command renders a form, which the maximized card must not hide.
  const form = await controller.commands.run("input.mode")
  expect(form.status).toBe("form")
  expect(store.session().maximizedCardId).toBeNull()

  await controller.dispose()
  await store.dispose?.()
})

test.each(["maximize", "minimize", "maximize-minimize-maximize"] as const)(
  "model edit completion preserves the later %s gesture",
  async (gesture) => {
    const directory = mkdtempSync(join(tmpdir(), "smithers-model-order-"))
    const db = new Database(join(directory, "app.sqlite"))
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    let hold = false, modelWrite = false
    const adapter = await openSqliteRowStorage({
      execute: async <Row>(sql: string, params: ReadonlyArray<unknown> = []) => {
        if (
          hold && /^\s*INSERT\b/i.test(sql) && params[0] === "app-cards" && typeof params[3] === "string"
          && JSON.parse(params[3]).kind === "flow-form" && JSON.parse(params[3]).payload.submitting === true
        ) modelWrite = true
        if (hold && modelWrite && /^\s*COMMIT\b/i.test(sql)) {
          hold = false
          entered.resolve()
          await release.promise
        }
        const statement = db.query(sql)
        if (/^\s*(SELECT|PRAGMA)/i.test(sql)) return statement.all(...params as []) as ReadonlyArray<Row>
        statement.run(...params as [])
        return []
      },
      close: () => db.close(),
    }, { collections: PERSISTED_COLLECTION_SPECS, schemaVersion: APP_SCHEMA_VERSION })
    const store = await createAppStore({
      kind: "opfs",
      ...adapter,
      storageEventApi: { addEventListener: () => {}, removeEventListener: () => {} },
    })
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === MODEL_CATALOG_PATH) {
          return Response.json({
            models: [],
            seats: [],
            credentials: [{ name: "LOOPBACK", present: true, origins: ["http://127.0.0.1:1"] }],
          })
        }
        if (path === "/api/user") return Response.json({ id: 1, username: "owner", is_admin: false })
        return new Response(null, { status: 404 })
      },
    })
    const controller = createAppController(store, unavailableAgent, { baseUrl: server.url.origin, fetchImpl: fetch })
    try {
      await controller.commands.run(
        "model.save",
        "--name mine --protocol openai-chat --model original --credential LOOPBACK --url http://127.0.0.1:1",
      )
      await store.settled?.()
      await controller.commands.run("model.edit", "mine")
      const formId = "form-model.save"
      await controller.setFormField(formId, "modelId", "revised")
      hold = true
      const submission = controller.commands.run("form.submit", formId)
      await entered.promise
      controller.maximizeCard("models")
      if (gesture !== "maximize") controller.minimizeCard()
      if (gesture === "maximize-minimize-maximize") controller.maximizeCard("models")
      const expectedPane = gesture === "minimize" ? null : "models"
      expect(store.session().maximizedCardId).toBe(expectedPane)
      release.resolve()
      await submission
      await store.settled?.()
      expect(store.collections.cards.get(formId)?.status).toBe("acted")
      expect(store.collections.models.get("mine")?.modelId).toBe("revised")
      const saved = db.query(`SELECT value FROM ${ROW_TABLE_NAME} WHERE collection_id = ?`).all("app-models") as Array<
        { value: string }
      >
      expect(saved.map(row => JSON.parse(row.value)).find(row => row.id === "mine")?.modelId).toBe("revised")
      expect(store.session().maximizedCardId).toBe(expectedPane)
    } finally {
      release.resolve()
      try {
        await controller.dispose()
      } finally {
        try {
          await store.dispose?.()
        } finally {
          await server.stop(true)
          rmSync(directory, { recursive: true, force: true })
        }
      }
    }
  },
  10000,
)
