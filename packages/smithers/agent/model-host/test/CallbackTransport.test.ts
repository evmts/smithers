import { agentTurnJournalDigestInput } from "@smthrs/rpc/AgentTurnJournal"
import type { AgentTurnBatch, AgentTurnCursor } from "@smthrs/rpc/AgentTurnJournal"
import type { AgentTurnFrame, StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Cause, Duration, Effect, Exit, Fiber } from "effect"
import { createHash } from "node:crypto"
import { channel } from "node:diagnostics_channel"
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

  test("a repeated close leaves another turn's observer attributing", async () => {
    // The subscription is shared and taken down by the last observer to close.
    // Closing one twice must not count twice: it would drop the channels under
    // a turn that is still running, and that turn's commits would then report
    // `none` — the reading that clears everything below this host of a fault
    // that is in fact still unattributed.
    const journal = await startJournal()
    const first = observeCallbackTransport(journal.baseUrl)
    const second = observeCallbackTransport(journal.baseUrl)
    first.close()
    first.close()
    const lines: Array<Record<string, unknown>> = []
    const producer = producerFor(journal.baseUrl, lines, second)
    await Effect.runPromise(producer.write(delta("a")))
    second.close()
    expect(attemptsOf(lines)).toEqual(["received"])
  })

  test("an attempt begun after its observer closed claims no phase at all", async () => {
    // A closed observer is not watching, so its attempts report nothing rather
    // than `none`: the request may well have reached the dispatcher, and this
    // observer is in no position to say it did not.
    const journal = await startJournal()
    const watching = observeCallbackTransport(journal.baseUrl)
    const closedObserver = observeCallbackTransport(journal.baseUrl)
    closedObserver.close()
    const attempt = closedObserver.begin()
    await attempt.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
    })
    expect(attempt.fields()).toEqual({})
    // The observer still open is unaffected by the other's close.
    const live = watching.begin()
    await live.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", journal.baseUrl), { method: "POST", body: "{}" })
      await answered.text()
    })
    expect(live.fields().transport).toBe("received")
    watching.close()
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

describe("a transport failure the host must answer with", () => {
  test("carries the phase it died in, because the guest's own log dies with the guest", async () => {
    // The attempt's record goes to the guest's log, and that log lives exactly
    // as long as the guest does: a turn whose callback failed is cleaned up,
    // and with it the only copy of how far it got. The failure carries the
    // same reading out to the caller over the one connection a callback fault
    // does not break.
    const journal = await startJournal(() => "silent")
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(journal.baseUrl)
    const producer = producerFor(journal.baseUrl, lines, transport)
    const exit = await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) as { transport?: Record<string, unknown> } : {}
    // The journal took the bytes and answered nothing, which is what the
    // guest's own record says too.
    expect(failure.transport?.transport).toBe("sent")
    // One reading, not two that could disagree: the record in the guest's log
    // is this failure's own fields, with the bound's own status beside them.
    expect(lines.at(-1)).toMatchObject(failure.transport ?? {})
    // An address dial resolves nothing, so the failure claims no resolution.
    expect(failure.transport?.lookupBegan).toBeUndefined()
  })

  test("carries no transport field when nothing was observed", async () => {
    // A producer driven by a caller's own fetch has no dispatcher record to
    // report, and an empty field would read as a record that found nothing.
    const journal = await startJournal(() => "silent")
    const lines: Array<Record<string, unknown>> = []
    const producer = producerFor(journal.baseUrl, lines, inertCallbackTransport as never)
    const exit = await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) as { transport?: unknown } : {}
    expect(failure.transport).toBeUndefined()
  })
})

describe("a callback dial's resolution", () => {
  /** The journal of `startJournal`, reached by a name rather than its address. */
  const byName = (baseUrl: string) => baseUrl.replace("//127.0.0.1:", "//localhost:")

  test("records the name it resolved before the connection it opened", async () => {
    // `created` with one connection begun and none ended was two faults at
    // once: a name still in the resolver, and a SYN nothing answered. The
    // socket the dial created separates them, and a good commit by name shows
    // both halves finishing.
    const journal = await startJournal()
    const baseUrl = byName(journal.baseUrl)
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(baseUrl)
    const producer = producerFor(baseUrl, lines, transport)
    await Effect.runPromise(producer.write(delta("a")))
    transport.close()
    expect(attemptsOf(lines)).toEqual(["received"])
    expect(lines[0]?.lookupBegan).toBe(1)
    expect(lines[0]?.lookupEnded).toBe(1)
    expect(lines[0]?.connectEnded).toBe(1)
    expect(lines[0]?.lookupCode).toBeUndefined()
  })

  test("separates a name that was answered from a connection that never came up", async () => {
    // The reading the production stall needed: the resolver finished and the
    // connection did not, so the fault is below the name and not in it.
    const closed = byName(await closedBaseUrl())
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(closed)
    const producer = producerFor(closed, lines, transport)
    await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(attemptsOf(lines)).toEqual(["created", "created"])
    expect(lines[0]?.lookupBegan).toBe(1)
    expect(lines[0]?.lookupEnded).toBe(1)
    expect(lines[0]?.lookupCode).toBeUndefined()
    expect(lines[0]?.connectEnded).toBe(0)
    expect(lines[0]?.connectCode).toBe("ECONNREFUSED")
  })

  test("records no resolution for a dial that has no name to resolve", async () => {
    // A dial to an address resolves nothing, and a resolution it never began
    // would read as one that never returned — the fault this record exists to
    // rule out. Its absence is also a fact: `created` with a connection begun
    // and no lookup is the connection, with nothing to blame on a resolver.
    const closed = await closedBaseUrl()
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(closed)
    const producer = producerFor(closed, lines, transport)
    await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(lines[0]?.connectBegan).toBe(1)
    expect(lines[0]?.lookupBegan).toBeUndefined()
    expect(lines[0]?.lookupEnded).toBeUndefined()
    expect(lines[0]?.lookupCode).toBeUndefined()
  })

  test("names a resolution that failed, apart from a connection that failed", async () => {
    // A name with no answer and a port with no listener are different faults
    // at different layers, and both ended as `created` before this record.
    // The code the resolver gave is the whole of what is kept.
    const baseUrl = "http://callback.invalid:8080"
    const lines: Array<Record<string, unknown>> = []
    const transport = observeCallbackTransport(baseUrl)
    const producer = producerFor(baseUrl, lines, transport)
    await Effect.runPromise(Effect.exit(producer.write(delta("a"))))
    transport.close()
    expect(attemptsOf(lines)).toEqual(["created", "created"])
    expect(lines[0]?.lookupBegan).toBe(1)
    expect(lines[0]?.lookupEnded).toBe(1)
    expect(typeof lines[0]?.lookupCode).toBe("string")
    expect(lines[0]?.connectEnded).toBe(0)
  })

  test("claims no socket another origin's dial created", async () => {
    // `net.client.socket` names no origin, so a socket is this attempt's only
    // when the dispatcher created it in the same turn as the dial this
    // observer counted. Another origin's dial, by name, must leave no
    // resolution behind on this attempt.
    const journal = await startJournal()
    const other = await startJournal()
    const transport = observeCallbackTransport(journal.baseUrl)
    const attempt = transport.begin()
    await attempt.run(async () => {
      const answered = await fetch(new URL("/internal/chat/commit", byName(other.baseUrl)), {
        method: "POST",
        body: "{}"
      })
      await answered.text()
    })
    const fields = attempt.fields()
    transport.close()
    expect(fields).toEqual({ transport: "none" })
  })
})

describe("a callback dial a forward proxy carried", () => {
  // Every hosted guest reaches its journal through the sandbox's egress
  // proxy, and that is the one network shape none of the cases above cover.
  // Under a proxy the dispatcher dials the journal's origin, hands that dial
  // to a connector, and the connector dials the PROXY — so the socket the
  // dial produced is the proxy's, and whatever it resolves is the proxy's
  // name, not the journal's. These cases replay the record order real
  // transport publishes in that shape, measured on the pinned Node 26.5.0
  // through a real CONNECT proxy and kept in
  // `diagnostics/continuation13/repro` with its readings: a HEALTHY proxied
  // callback reported `lookupBegan: 1, lookupEnded: 0`, which this file's own
  // documentation reads as a name still in the resolver. Publishing on the
  // dispatcher's own channels is the subscriber's real seam; the proxy is the
  // part that cannot be raised inside one coverage-instrumented process.
  const create = channel("undici:request:create")
  const beforeConnect = channel("undici:client:beforeConnect")
  const connected = channel("undici:client:connected")
  const clientSocket = channel("net.client.socket")
  const sendHeaders = channel("undici:client:sendHeaders")
  const headers = channel("undici:request:headers")
  const trailers = channel("undici:request:trailers")

  const dialOf = (origin: string) => {
    const { host, hostname } = new URL(origin)
    return { connectParams: { host, hostname } }
  }

  /** A socket a dial created, which reports the names it is asked to resolve. */
  const socketFor = (resolves: ReadonlyArray<string>) => {
    const asked: Array<string> = []
    const socket = {
      once: (event: string, listener: (error: null) => void) => {
        asked.push(event)
        for (const _ of resolves) listener(null)
        return socket
      }
    }
    return { socket, asked }
  }

  /**
   * One attempt through a proxy, in the dispatcher's own order: the journal's
   * request and dial, then the proxy's request and dial, then the one socket
   * the connector created, then both connections and the answer.
   */
  const proxiedAttempt = (journalOrigin: string, proxyOrigin: string, resolves: ReadonlyArray<string>) => {
    const transport = observeCallbackTransport(journalOrigin)
    const attempt = transport.begin()
    const request = { origin: journalOrigin, path: "/internal/chat/commit" }
    const dialled = socketFor(resolves)
    attempt.run(() => {
      create.publish({ request })
      beforeConnect.publish(dialOf(journalOrigin))
      create.publish({ request: { origin: proxyOrigin, path: new URL(journalOrigin).host } })
      beforeConnect.publish(dialOf(proxyOrigin))
      clientSocket.publish({ socket: dialled.socket })
      connected.publish(dialOf(proxyOrigin))
      connected.publish(dialOf(journalOrigin))
      sendHeaders.publish({ request, socket: {} })
      headers.publish({ request })
      trailers.publish({ request })
      return Promise.resolve()
    })
    const fields = attempt.fields()
    transport.close()
    return { fields, asked: dialled.asked }
  }

  test("reports no resolution of its own when the proxy is an address", () => {
    // The measured production-shaped reading. The connection counts are the
    // journal's own and stay; the resolution is the proxy's and must not be
    // claimed, because an address resolves nothing and `lookupBegan` without
    // `lookupEnded` would read as a journal name stuck in the resolver.
    const { asked, fields } = proxiedAttempt("http://journal.invalid:8080", "http://127.0.0.1:41038", [])
    expect(fields.transport).toBe("received")
    expect(fields.connectBegan).toBe(1)
    expect(fields.connectEnded).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(asked).toEqual([])
  })

  test("does not read the proxy's own resolution as the journal's", () => {
    // A guest's proxy is itself named (`host.microsandbox.internal`), so the
    // socket the connector created does resolve a name — the proxy's. Reading
    // it as the journal's would report a resolution this host never made and
    // would carry the proxy's resolver failure under the journal's code.
    const { asked, fields } = proxiedAttempt("http://journal.invalid:8080", "http://proxy.invalid:41038", ["lookup"])
    expect(fields.transport).toBe("received")
    expect(fields.connectBegan).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(fields.lookupCode).toBeUndefined()
    expect(asked).toEqual([])
  })

  test("still separates a name from a connection for a dial this host makes itself", () => {
    // The reading the proxy case gives up must survive where it is sound: an
    // unproxied dial by name still records both halves of its resolution.
    const journalOrigin = "http://journal.invalid:8080"
    const transport = observeCallbackTransport(journalOrigin)
    const attempt = transport.begin()
    const request = { origin: journalOrigin, path: "/internal/chat/commit" }
    const dialled = socketFor(["lookup"])
    attempt.run(() => {
      create.publish({ request })
      beforeConnect.publish(dialOf(journalOrigin))
      clientSocket.publish({ socket: dialled.socket })
      return Promise.resolve()
    })
    const fields = attempt.fields()
    transport.close()
    expect(fields.lookupBegan).toBe(1)
    expect(fields.lookupEnded).toBe(1)
    expect(dialled.asked).toEqual(["lookup"])
  })
})

describe("the inert transport", () => {
  test("runs the request and adds no field a caller cannot stand behind", async () => {
    const attempt = inertCallbackTransport.begin()
    expect(await attempt.run(() => Promise.resolve("ran"))).toBe("ran")
    expect(attempt.fields()).toEqual({})
  })
})
