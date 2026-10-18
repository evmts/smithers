// node --test bench/
import assert from "node:assert/strict"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"
import { apply, Follower, initialSync, type Row, type ShapeMessage } from "./chatapi.ts"

const change = (operation: "insert" | "update" | "delete", value: Partial<Row>): ShapeMessage => ({
  key: `"public"."messages"/"${value.id}"`,
  value,
  headers: { operation },
})
const upToDate: ShapeMessage = { headers: { control: "up-to-date" } }

// Serves Electric's protocol as scripted responses, keyed by the request's offset, and records each request.
type Reply = { status?: number; offset: string; body: Array<ShapeMessage> }
const electric = async (respond: (params: URLSearchParams) => Reply | Promise<Reply>) => {
  const requests: Array<URLSearchParams> = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost")
    requests.push(url.searchParams)
    const { status = 200, offset, body } = await respond(url.searchParams)
    response.writeHead(status, { "content-type": "application/json", "electric-handle": "h1", "electric-offset": offset }).end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { baseUrl, requests, close: () => new Promise((resolve) => server.close(resolve)) }
}

test("apply sets inserts, merges updates' changed columns, removes deletes and reports up-to-date", () => {
  const rows = new Map<string, Row>()
  const first = apply(rows, [change("insert", { id: "a", role: "assistant", text: "", status: "streaming" }), change("insert", { id: "b", text: "x" })])
  assert.deepEqual([...first.changed], ["a", "b"])
  assert.equal(first.upToDate, false)
  const second = apply(rows, [change("update", { id: "a", text: "word" }), change("update", { id: "a", status: "done" }), change("delete", { id: "b" }), upToDate])
  assert.deepEqual(rows.get("a"), { id: "a", role: "assistant", text: "word", status: "done" })
  assert.equal(rows.has("b"), false)
  assert.equal(second.upToDate, true)
})

test("initialSync starts at offset -1 with no handle and follows Electric's offset and handle until up-to-date", async () => {
  const server = await electric((params) =>
    params.get("offset") === "-1"
      ? { offset: "0_0", body: [{ headers: { control: "snapshot-end" } }] }
      : params.get("offset") === "0_0"
        ? { offset: "5_0", body: [change("insert", { id: "a", text: "one" }), change("insert", { id: "b", text: "two" })] }
        : { offset: "9_0", body: [change("update", { id: "a", text: "one!" }), upToDate] },
  )
  try {
    const sync = await initialSync(server.baseUrl)
    assert.deepEqual(
      server.requests.map((params) => [params.get("offset"), params.get("handle")]),
      [["-1", null], ["0_0", "h1"], ["5_0", "h1"]],
    )
    assert.equal(sync.requests, 3)
    assert.equal(sync.rows.size, 2)
    assert.equal(sync.operations, 3)
    assert.equal(sync.rows.get("a")?.text, "one!")
    assert.ok(sync.bytes > 0 && sync.ms > 0)
  } finally {
    await server.close()
  }
})

test("initialSync fails on an error status", async () => {
  const server = await electric(() => ({ status: 502, offset: "0_0", body: [] }))
  try {
    await assert.rejects(initialSync(server.baseUrl), /answered 502 at offset -1/)
  } finally {
    await server.close()
  }
})

test("a Follower joins at offset=now, long-polls live, and records each row's first text and settling", async () => {
  let polls = 0
  const server = await electric(async (params) => {
    if (params.get("offset") === "now") return { offset: "1_0", body: [upToDate] }
    assert.equal(params.get("live"), "true")
    polls++
    if (polls === 1) return { offset: "2_0", body: [change("insert", { id: "q", role: "user", text: "ask w1" }), change("insert", { id: "a", role: "assistant", text: "", status: "streaming", question_id: "q" }), upToDate] }
    if (polls === 2) return { offset: "3_0", body: [change("update", { id: "a", text: "w1" }), upToDate] }
    if (polls === 3) return { offset: "4_0", body: [change("update", { id: "a", status: "done" }), upToDate] }
    return new Promise<Reply>(() => {}) // a long-poll with nothing new: held open until the follower stops
  })
  const follower = new Follower(server.baseUrl)
  try {
    await follower.start()
    const answer = await follower.until(() => {
      const asked = follower.questionWith("w1")
      const reply = asked && follower.answerTo(asked.id)
      return reply?.status === "done" ? reply : undefined
    }, 5_000, "the answer")
    assert.equal(answer.text, "w1")
    const timeline = follower.timelines.get("a")!
    assert.ok(timeline.seenAt > 0 && timeline.seenAt <= timeline.firstTextAt && timeline.firstTextAt <= timeline.settledAt)
    // The question arrived with its answer, in one response: when the bench's pages count it confirmed.
    assert.equal(follower.timelines.get("q")?.seenAt, timeline.seenAt)
    assert.deepEqual(
      server.requests.slice(1, 4).map((params) => params.get("offset")),
      ["1_0", "2_0", "3_0"],
    )
    await assert.rejects(follower.until(() => undefined, 20, "nothing"), /no nothing from Electric after 20 ms/)
  } finally {
    await follower.stop()
    await server.close()
  }
})
