import { agentTurnJournalDigestInput } from "@smthrs/rpc/AgentTurnJournal"
import type { AgentTurnBatch, AgentTurnCursor } from "@smthrs/rpc/AgentTurnJournal"
import type { AgentTurnFrame, StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Duration, Effect, Fiber } from "effect"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import { inertCallbackTransport, observeCallbackTransport } from "../src/CallbackTransport.ts"
import { DurableChatProducer } from "../src/DurableChatProducer.ts"

/**
 * Phase attribution for a journal callback, over real sockets.
 *
 * The production stall (#3812) ended unattributed: the guest recorded a commit
 * attempted and never answered, and its IPv4 socket table held nothing for it,
 * which is consistent with a request the dispatcher never took, a connection
 * that never came up, and a DNS lookup that never returned alike. These cases
 * pin that each of those shapes is now distinguishable from the guest's own
 * record — so a recurrence names a phase instead of leaving one open.
 *
 * Every case drives the host's own `fetch` against a real journal. A stub
 * cannot hold this contract: the records under test are the ones Node's
 * dispatcher publishes while the bytes move.
 */

const request: StartAgentTurnRequest = {
  runId: "run",
  instructions: "answer",
  messages: [{ role: "user", content: "hi" }]
}
const cursor: AgentTurnCursor = { version: 1, runId: "run", legId: "leg", batch: 0, position: 0, hash: "a".repeat(64) }
const grantFor = (producerBaseUrl: string) => ({
  turnId: "turn",
  ownerId: 1,
  runId: "run",
  legId: "leg",
  generation: 3,
  token: "capability_capability_capability_1234",
  cursor,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  request,
  producerBaseUrl
})

const digest = (value: unknown): string =>
  createHash("sha256").update(agentTurnJournalDigestInput("batch", value)).digest("hex")

const receipt = (expected: AgentTurnCursor, frame: AgentTurnFrame, status: "committed" | "duplicate") => {
  const unsigned = {
    version: 1 as const,
    runId: expected.runId,
    legId: expected.legId,
    batch: expected.batch + 1,
    from: expected.position + 1,
    previousHash: expected.hash,
    frames: [frame]
  }
  const batch: AgentTurnBatch = { ...unsigned, hash: digest(unsigned) }
  return {
    status,
    batch,
    cursor: {
      version: 1 as const,
      runId: batch.runId,
      legId: batch.legId,
      batch: batch.batch,
      position: batch.from,
      hash: batch.hash
    }
  }
}

/** How a journal treats one commit. */
type Treatment = "answer" | "silent" | "headers-only" | "late"

interface Journal {
  readonly baseUrl: string
  /** The batches this journal took, once each. */
  readonly admitted: Array<number>
  /** Every request this journal received, including the ones it refuses to answer. */
  readonly received: Array<number>
  treat: (batch: number, attempt: number) => Treatment
}

const servers: Array<Server> = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
    )
  )
})

const startJournal = async (
  treat: (batch: number, attempt: number) => Treatment = () => "answer"
): Promise<Journal> => {
  const state = { treat, admitted: [] as Array<number>, received: [] as Array<number> }
  const handle = (incoming: IncomingMessage, answer: ServerResponse): void => {
    const chunks: Array<Buffer> = []
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
    incoming.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        readonly expected?: AgentTurnCursor
        readonly frames?: ReadonlyArray<AgentTurnFrame>
      }
      // A request that carries no batch is one of the host's other callbacks,
      // or a bare request a case made to exercise the observer; it is answered
      // and not counted as a commit.
      const frame = body.frames === undefined ? undefined : body.frames[0]
      if (frame === undefined || body.expected === undefined) {
        answer.writeHead(204).end()
        return
      }
      // The batch a request is for is the one its own expected cursor names,
      // so a retry of a batch this journal already took is recognisable as
      // the same batch rather than read as the next one.
      const expected = body.expected
      const target = expected.batch + 1
      state.received.push(target)
      const treatment = state.treat(target, state.received.filter((batch) => batch === target).length)
      if (treatment === "silent") return
      if (treatment === "headers-only") {
        answer.writeHead(200, { "content-type": "application/json" })
        answer.flushHeaders()
        return
      }
      // A journal that took the batch answers the identical retry `duplicate`
      // from the receipt it already wrote, so a bound that fired on an answer
      // in flight cannot fork the transcript.
      const taken = state.admitted.includes(target)
      const reply = receipt(expected, frame, taken ? "duplicate" : "committed")
      if (!taken) state.admitted.push(target)
      const send = () => {
        answer.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply))
      }
      if (treatment === "late") setTimeout(send, 600)
      else send()
    })
  }
  const server = createServer(handle)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    admitted: state.admitted,
    received: state.received,
    get treat() {
      return state.treat
    },
    set treat(value) {
      state.treat = value
    }
  }
}

/** A port nothing listens on, so a connection to it is refused at once. */
const closedBaseUrl = async (): Promise<string> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

const delta = (text: string): AgentTurnFrame => ({ runId: "run", type: "delta", kind: "text", text })

/** The transport fields of every attempt one producer made. */
const attemptsOf = (lines: Array<Record<string, unknown>>) => lines.map((line) => line.transport)

const recorderInto = (lines: Array<Record<string, unknown>>) => ({
  record: () => {},
  begin: () => (outcome: Record<string, unknown> = {}) => {
    lines.push(outcome)
  }
})

const deadline = 300

const producerFor = (
  baseUrl: string,
  lines: Array<Record<string, unknown>>,
  transport: ReturnType<typeof observeCallbackTransport>,
  deadlineMillis = deadline
) =>
  new DurableChatProducer(
    baseUrl,
    grantFor(baseUrl),
    undefined,
    recorderInto(lines),
    deadlineMillis,
    transport
  )

const waitUntil = async (ready: () => boolean, complaint: string): Promise<void> => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(complaint)
}

describe("a journal callback's transport phase", () => {
  test("reaches the body's end when the journal answers, and later commits reuse a connection", async () => {
    const journal = await startJournal()
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport)
    for (const text of ["a", "b", "c", "d", "e"]) {
      await Effect.runPromise(producer.write(delta(text)))
    }
    transport.close()
    expect(attemptsOf(lines)).toEqual(["received", "received", "received", "received", "received"])
    // A reused keep-alive connection and a fresh one are different facts about
    // the same journal, and the record tells them apart.
    expect(lines.some((line) => line.reusedSocket === false)).toBe(true)
    expect(lines.some((line) => line.reusedSocket === true)).toBe(true)
    // The first attempt opened a connection of its own, and the record says so.
    expect(lines[0]?.connectBegan).toBe(1)
    expect(lines[0]?.connectEnded).toBe(1)
    expect(lines[0]?.errorName).toBeUndefined()
  })

  test("reports the bytes as sent when the journal takes them and answers nothing", async () => {
    // The production shape, with the one thing the old evidence could not say:
    // the request did reach a socket, so nothing above the journal is at fault.
    const journal = await startJournal(() => "silent")
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport)
    const exit = await Effect.runPromise(
      Effect.exit(producer.write(delta("a"))).pipe(
        Effect.timeoutOrElse({
          duration: Duration.seconds(10),
          orElse: () => Effect.die(new Error("the commit was never bounded"))
        })
      )
    )
    transport.close()
    expect(exit._tag).toBe("Failure")
    expect(attemptsOf(lines)).toEqual(["sent", "sent"])
    expect(lines.every((line) => line.timedOut === true)).toBe(true)
  })

  test("reports headers as received when the journal answers its status and stops", async () => {
    // One message further on than the silent journal, and a different repair:
    // the bytes arrived, the journal accepted them, and the receipt is what
    // never came.
    const journal = await startJournal(() => "headers-only")
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport)
    await Effect.runPromise(
      Effect.exit(producer.write(delta("a"))).pipe(
        Effect.timeoutOrElse({
          duration: Duration.seconds(10),
          orElse: () => Effect.die(new Error("the receipt read was never bounded"))
        })
      )
    )
    transport.close()
    expect(attemptsOf(lines)).toEqual(["responded", "responded"])
    // The attempt ended on the bound, not on the journal's status: an abort
    // that lands after the headers must not read as an attempt that never
    // reached them.
    expect(lines.every((line) => line.timedOut === true)).toBe(true)
  })

  test("names the connection's own failure when nothing is listening", async () => {
    // A refused connection and a silent journal are the same `pending` record
    // without this: both are a commit that never answers.
    const baseUrl = await closedBaseUrl()
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(baseUrl)
    const producer = producerFor(baseUrl, lines, transport)
    await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(attemptsOf(lines)).toEqual(["created", "created"])
    expect(lines[0]?.connectBegan).toBe(1)
    expect(lines[0]?.connectEnded).toBe(0)
    expect(lines[0]?.connectFailed).toBe(1)
    expect(lines[0]?.connectCode).toBe("ECONNREFUSED")
    expect(lines[0]?.errorCode).toBe("ECONNREFUSED")
    expect(typeof lines[0]?.errorName).toBe("string")
  })

  test("reports the phase a cancelled commit was interrupted in", async () => {
    const journal = await startJournal(() => "silent")
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport, 30_000)
    const fiber = Effect.runFork(producer.write(delta("a")))
    await waitUntil(() => journal.received.length > 0, "the commit never reached the journal")
    await Effect.runPromise(Fiber.interrupt(fiber))
    transport.close()
    // A cancelled turn still says where its request got to, and says it was
    // not the bound that ended it.
    expect(attemptsOf(lines)).toEqual(["sent"])
    expect(lines[0]?.timedOut).toBeUndefined()
  })

  test("a journal that already took the batch answers the retry duplicate, and the cursor advances once", async () => {
    // The bound fires on an answer in flight. The retry carries the identical
    // cursor and body, so the journal answers `duplicate` and the producer
    // takes that receipt: one admitted batch, no fork.
    const journal = await startJournal((_batch, attempt) => attempt === 1 ? "late" : "answer")
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport, 200)
    const exit = await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(exit._tag).toBe("Success")
    expect(journal.admitted).toEqual([1])
    expect(lines).toHaveLength(2)
    expect(lines[0]?.timedOut).toBe(true)
    expect(lines[0]?.transport).toBe("sent")
    expect(lines[1]?.transport).toBe("received")
  })

  test("reports none when the request never reaches the dispatcher", async () => {
    // The strongest reading the old evidence was missing: no dispatcher record
    // at all means the request never left this host, so no connection, proxy
    // or journal can be blamed for it.
    const journal = await startJournal()
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = new DurableChatProducer(
      journal.baseUrl,
      grantFor(journal.baseUrl),
      () => Promise.resolve(Response.json(receipt(cursor, delta("a"), "committed"))),
      recorderInto(lines),
      deadline,
      transport
    )
    await Effect.runPromise(producer.write(delta("a")))
    transport.close()
    expect(attemptsOf(lines)).toEqual(["none"])
    expect(lines[0]?.reusedSocket).toBeUndefined()
    expect(lines[0]?.connectBegan).toBeUndefined()
  })

  test("attributes nothing to an attempt from another origin's request or connection", async () => {
    const journal = await startJournal()
    const other = await startJournal()
    const transport = observeCallbackTransport(journal.baseUrl)
    const attempt = transport.begin()
    await attempt.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", other.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
    })
    const fields = attempt.fields()
    transport.close()
    // Another origin's request is not this attempt's, and neither is the
    // connection it opened.
    expect(fields).toEqual({ transport: "none" })
  })

  test("claims one request per attempt, so another fiber's callback is not read as this one's", async () => {
    // Effect runs many fibers inside one scheduler task, so a callback another
    // fiber dispatches can be created while this attempt's context is still
    // the ambient one. An attempt makes one request; the second is not its own
    // however much it looks like it.
    const journal = await startJournal()
    const closed = await closedBaseUrl()
    const transport = observeCallbackTransport(journal.baseUrl)
    const attempt = transport.begin()
    await attempt.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
      await fetch(new URL("/internal/chat/commit", closed), { method: "POST", body: "{}" }).catch(() => undefined)
    })
    const fields = attempt.fields()
    transport.close()
    expect(fields.transport).toBe("received")
    expect(fields.errorCode).toBeUndefined()
    expect(fields.connectFailed).toBeUndefined()
  })

  test("stops attributing once closed, and two observers share one subscription", async () => {
    const journal = await startJournal()
    const first = observeCallbackTransport(journal.baseUrl)
    const second = observeCallbackTransport(journal.baseUrl)
    const attempt = first.begin()
    const reached = await attempt.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
      return attempt.fields()
    })
    expect(reached.transport).toBe("received")
    // An observer closed while another is open leaves the second one working;
    // an open attempt it never read is dropped rather than left in the set.
    const dropped = first.begin()
    first.close()
    const after = second.begin()
    await after.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
    })
    expect(after.fields().transport).toBe("received")
    expect(dropped.fields()).toEqual({ transport: "none" })
    second.close()
    // With no observer left the channels are unsubscribed: a request made now
    // is attributed to nothing, even inside a new attempt.
    const silent = observeCallbackTransport(journal.baseUrl)
    const outside = silent.begin()
    silent.close()
    await outside.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
    })
    expect(outside.fields()).toEqual({ transport: "none" })
  })

  test("ignores every record of a request no attempt made", async () => {
    // The host's other callbacks reach the same origin outside any attempt,
    // and a failure of one of them belongs to no attempt either.
    const journal = await startJournal()
    const closed = await closedBaseUrl()
    const transport = observeCallbackTransport(journal.baseUrl)
    const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
    await answered.text()
    await fetch(new URL("/internal/chat/commit", closed), { method: "POST", body: "{}" }).catch(() => undefined)
    const attempt = transport.begin()
    const fields = attempt.fields()
    transport.close()
    expect(fields).toEqual({ transport: "none" })
  })
})

describe("the inert transport", () => {
  test("runs the request and adds no field a caller cannot stand behind", async () => {
    const attempt = inertCallbackTransport.begin()
    expect(await attempt.run(() => Promise.resolve("ran"))).toBe("ran")
    expect(attempt.fields()).toEqual({})
  })
})
