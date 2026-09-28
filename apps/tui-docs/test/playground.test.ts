import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import { test } from "node:test"
import { run } from "../src/playground/agent.ts"
import { canonical, Journal, path, seed, storageKey } from "../src/playground/store.ts"
const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}
const byteText = (character: string, bytes: number) => {
  const width = Buffer.byteLength(character, "utf8")
  return character.repeat(Math.floor(bytes / width)) + "a".repeat(bytes % width)
}
const encodings = [{ name: "ASCII", character: "a" }, { name: "CJK", character: "界" }, {
  name: "emoji",
  character: "😀"
}]
const scriptedWrite = async (journal: Journal, program: string, answer: string) => {
  const replies = [`\`\`\`cell\n${program}\n\`\`\``, `\`\`\`cell\nctx.done(${JSON.stringify(answer)});\n\`\`\``]
  const requests: Array<{ url: string | undefined; method: string | undefined; body: any }> = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push({ url: request.url, method: request.method, body: JSON.parse(Buffer.concat(chunks).toString()) })
    const reply = replies[requests.length - 1]
    response.setHeader("Content-Type", "application/json")
    response.statusCode = reply === undefined ? 503 : 200
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: reply } }] }))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  try {
    const address = server.address()
    assert(address && typeof address !== "string")
    await run(
      journal,
      { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "", model: "local-fixture" },
      () => {},
      new AbortController().signal
    )
    assert.equal(journal.head.run?.status, "done", journal.head.run?.error)
    assert.equal(requests.length, 2, "write results must be consumed before a separate completion reply")
    assert(requests.every((request) => request.url === "/v1/chat/completions" && request.method === "POST"))
    assert(requests.every((request) => request.body.model === "local-fixture" && request.body.stream === false))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

for (const { name, character } of encodings) {
  for (const bytes of [8191, 8192, 8193]) {
    test(`${name} sandbox writes of ${bytes} UTF-8 bytes obey the per-file limit`, async () => {
      const storage = memory(), journal = new Journal(storage)
      const content = byteText(character, bytes), width = Buffer.byteLength(character, "utf8")
      assert.equal(Buffer.byteLength(content, "utf8"), bytes)
      const allowed = bytes <= 8192
      journal.start(
        "Attempt the same payload in a new file and math.js. Report any refusals.",
        `write-${name}-${bytes}`
      )
      await scriptedWrite(
        journal,
        `const payload = ${JSON.stringify(character)}.repeat(${Math.floor(bytes / width)}) + ${
          JSON.stringify("a".repeat(bytes % width))
        };\nconsole.log(await ctx.call("write", {path:"notes.txt",content:payload}));\nconsole.log(await ctx.call("write", {path:"math.js",content:payload}));`,
        allowed ? "Write requests accepted." : "Write requests refused by the sandbox file limit."
      )
      const calls = Object.values(journal.head.run!.calls)
      assert.equal(calls.length, 2)
      for (const call of calls) {
        const result = call.result as { outcome: string; message?: string; code?: string }
        assert.equal(result.outcome, allowed ? "success" : "failure")
        if (!allowed) {
          assert.equal(result.code, "flow_failed")
          assert.equal(result.message, "Flow write failed.")
        }
      }
      const expected = allowed ? { ...seed, "math.js": content, "notes.txt": content } : seed
      assert.deepEqual(journal.head.files, expected, "a refused creation or overwrite must not mutate any file")
      assert.deepEqual(new Journal(storage).head.files, expected, "reload must preserve the real write outcome")
    })
  }
}

for (const { name, character } of encodings) {
  for (const bytes of [3_999_999, 4_000_000, 4_000_001]) {
    test(`${name} history of ${bytes} serialized UTF-8 bytes commits atomically`, () => {
      const calibrationStorage = memory(), calibration = new Journal(calibrationStorage)
      calibration.update((frame) => frame.events.push({ kind: "answer", text: "" }))
      const empty = calibrationStorage.getItem(storageKey)!
      const text = byteText(character, bytes - Buffer.byteLength(empty, "utf8"))
      const expected = empty.replace("\"text\":\"\"", `"text":${JSON.stringify(text)}`)
      assert.equal(Buffer.byteLength(expected, "utf8"), bytes)
      const storage = memory(), journal = new Journal(storage)
      journal.select("main")
      const before = structuredClone(journal.state), persisted = storage.getItem(storageKey)
      const commit = () => journal.update((frame) => frame.events.push({ kind: "answer", text }))
      if (bytes <= 4_000_000) {
        commit()
        assert.equal(storage.getItem(storageKey), expected)
        assert.equal(journal.head.events[0]!.text, text)
        assert.deepEqual(new Journal(storage).state, journal.state)
      } else {
        assert.throws(commit, /Sandbox history is full/)
        assert.deepEqual(journal.state, before, "refusal leaves all in-memory checkpoints intact")
        assert.equal(storage.getItem(storageKey), persisted, "refusal leaves the prior serialized history intact")
        assert.deepEqual(new Journal(storage).state, before)
        journal.update((frame) => frame.events.push({ kind: "answer", text: "Recovered." }))
        assert.deepEqual(new Journal(storage).head.events, [{ kind: "answer", text: "Recovered." }])
      }
    })
  }
}

test("the sixteen-file boundary permits overwrites while refusing new files and read-only checks", async () => {
  const journal = new Journal(memory())
  journal.start("Fill the volume; retain existing-file writes and report refused requests.", "file-count")
  await scriptedWrite(
    journal,
    `for (let i = 0; i < 14; i++) console.log(await ctx.call("write", {path:"note"+i+".txt",content:"kept"}));\nconsole.log(await ctx.call("write", {path:"overflow.txt",content:"refused"}));\nconsole.log(await ctx.call("write", {path:"math.js",content:"replaced"}));\nconsole.log(await ctx.call("write", {path:"check.js",content:"refused"}));`,
    "The extra file and check edit were refused; the existing math file was replaced."
  )
  assert.equal(Object.keys(journal.head.files).length, 16)
  assert.equal(journal.head.files["math.js"], "replaced")
  assert.equal(journal.head.files["check.js"], seed["check.js"])
  assert.equal(journal.head.files["overflow.txt"], undefined)
  for (let i = 0; i < 14; i++) assert.equal(journal.head.files[`note${i}.txt`], "kept")
  const calls = Object.values(journal.head.run!.calls).map((call) =>
    call.result as {
      outcome: string
      message?: string
      code?: string
    }
  )
  assert.equal(calls.length, 17)
  assert.equal(calls.filter((result) => result.outcome === "success").length, 15)
  assert.deepEqual(
    calls.filter((result) => result.outcome === "failure").map((result) => ({
      code: result.code,
      message: result.message
    })),
    [{ code: "flow_failed", message: "Flow write failed." }, { code: "flow_failed", message: "Flow write failed." }]
  )
})
test("atomic persistence, reload, historical isolation, and branching", () => {
  const storage = memory(), journal = new Journal(storage)
  journal.start("fix", "run")
  journal.update((frame) => {
    frame.files["math.js"] = "fixed"
    frame.events.push({ kind: "answer", text: "future" })
  })
  assert.deepEqual(journal.branch.frames[0]!.files, seed)
  assert.deepEqual(journal.branch.frames[0]!.events, [])
  const restored = new Journal(storage)
  assert.equal(restored.head.files["math.js"], "fixed")
  restored.branchAt(0, "child")
  assert.deepEqual(restored.head.files, seed)
  restored.select("main")
  assert.equal(restored.head.files["math.js"], "fixed")
  const before = structuredClone(restored.state)
  storage.setItem = () => {
    throw new Error("quota")
  }
  assert.throws(() =>
    restored.update((frame) => {
      frame.files["math.js"] = "lost"
    }), /quota/)
  assert.deepEqual(restored.state, before)
})
test("refuses corrupt persisted data and paths outside the volume", () => {
  const storage = memory()
  storage.setItem(storageKey, "broken")
  assert.throws(() => new Journal(storage))
  for (const value of ["../secret", "/secret", "a/b.js", "__proto__", ""]) assert.throws(() => path(value))
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }))
})
test("production agent recovers committed calls and model replies after interruption", async () => {
  const storage = memory(), journal = new Journal(storage), previous = globalThis.fetch
  let requests = 0
  const first =
    "```cell\nawait ctx.call(\"write\", {path:\"math.js\",content:\"export const add = (a, b) => a + b\\n\"});\nconsole.log(await ctx.call(\"check\", {}));\n```"
  const last = "```cell\nctx.done(\"Fixed and checked.\");\n```"
  const controller = new AbortController()
  globalThis.fetch = async (_url, init) => {
    requests++
    if (requests === 2) {
      queueMicrotask(() => controller.abort())
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      )
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: requests === 1 ? first : last } }] })
  }
  try {
    journal.start("Fix addition", "durable-example")
    await run(journal, { baseUrl: "", apiKey: "", model: "" }, () => {}, controller.signal)
    assert.equal(journal.head.run?.status, "failed")
    assert.match(journal.head.files["math.js"]!, /a \+ b/)
    const count = Object.keys(journal.head.run!.calls).length
    assert.equal(count, 2)
    const restored = new Journal(storage)
    await run(restored, { baseUrl: "", apiKey: "", model: "" }, () => {}, new AbortController().signal)
    assert.equal(restored.head.run?.status, "done", restored.head.run?.error)
    assert.equal(requests, 3, "completed first model response was replayed")
    assert.equal(Object.keys(restored.head.run!.calls).length, count, "completed flow calls were not duplicated")
    assert.equal(restored.head.events.filter((e) => e.kind === "flow").length, 2)
  } finally {
    globalThis.fetch = previous
  }
})
test("a provider refusal stays visible and retryable", async () => {
  const previous = globalThis.fetch, journal = new Journal(memory())
  globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 })
  try {
    journal.start("fix", "refused")
    await run(journal, { baseUrl: "", apiKey: "", model: "" }, () => {}, new AbortController().signal)
    assert.equal(journal.head.run?.status, "failed")
    assert.match(journal.head.run?.error ?? "", /Settings|unavailable/i)
    assert.deepEqual(journal.head.files, seed)
  } finally {
    globalThis.fetch = previous
  }
})
