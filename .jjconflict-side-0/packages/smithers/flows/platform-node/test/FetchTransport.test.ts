/**
 * Phase attribution for a `fetch` to one origin, over real sockets.
 *
 * The production stall (#3812) ended unattributed: the guest recorded a
 * journal commit attempted and never answered, and its IPv4 socket table held
 * nothing for it, which is consistent with a request the dispatcher never
 * took, a connection that never came up, and a DNS lookup that never returned
 * alike. These cases pin that each of those shapes is distinguishable from the
 * attempt's own record — so a recurrence names a phase instead of leaving one
 * open.
 *
 * Every socket case drives Node's own `fetch` against a real server. A stub
 * cannot hold this contract: the records under test are the ones Node's
 * dispatcher publishes while the bytes move. The proxy and overlap cases
 * publish on the dispatcher's own channels in the order real transport was
 * measured to publish them, because a proxy cannot be raised inside one
 * coverage-instrumented process.
 */
import { channel } from "node:diagnostics_channel"
import { createServer } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, test } from "vitest"
import * as FetchTransport from "../src/FetchTransport.ts"

/** How a server treats one request. */
type Treatment = "answer" | "silent" | "headers-only"

interface Origin {
  readonly baseUrl: string
  /** Every request this server received, including the ones it never answers. */
  readonly received: Array<string>
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

const startOrigin = async (treatment: Treatment = "answer"): Promise<Origin> => {
  const received: Array<string> = []
  const handle = (incoming: IncomingMessage, answer: ServerResponse): void => {
    incoming.resume()
    incoming.on("end", () => {
      received.push(incoming.url ?? "/")
      if (treatment === "silent") return
      if (treatment === "headers-only") {
        answer.writeHead(200, { "content-type": "application/json" })
        answer.flushHeaders()
        return
      }
      answer.writeHead(200, { "content-type": "application/json" }).end("{}")
    })
  }
  const server = createServer(handle)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, received }
}

/** A port nothing listens on, so a connection to it is refused at once. */
const closedBaseUrl = async (): Promise<string> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

/** The origin of `startOrigin`, reached by a name rather than its address. */
const byName = (baseUrl: string) => baseUrl.replace("//127.0.0.1:", "//localhost:")

/** One POST and its whole body, as a caller would send a callback. */
const post = async (baseUrl: string, signal?: AbortSignal): Promise<void> => {
  const answered = await fetch(new URL("/internal/chat/commit", baseUrl), {
    method: "POST",
    body: "{}",
    ...(signal === undefined ? {} : { signal })
  })
  await answered.text()
}

/**
 * One attempt of one request, bounded the way a caller bounds its own: the
 * deadline aborts the request and its body read alike, and the attempt then
 * reports the phase it reached.
 */
const attemptOn = async (
  observer: FetchTransport.Observer,
  baseUrl: string,
  deadlineMillis = 300
): Promise<FetchTransport.Fields> => {
  const attempt = observer.begin()
  await attempt.run(() => post(baseUrl, AbortSignal.timeout(deadlineMillis))).catch(() => undefined)
  return attempt.fields()
}

describe("a request's transport phase", () => {
  test("reaches the body's end when the origin answers, and later requests reuse a connection", async () => {
    const origin = await startOrigin()
    const observer = FetchTransport.observe(origin.baseUrl)
    const attempts: Array<FetchTransport.Fields> = []
    for (let index = 0; index < 5; index += 1) attempts.push(await attemptOn(observer, origin.baseUrl))
    observer.close()
    expect(attempts.map((fields) => fields.transport)).toEqual([
      "received",
      "received",
      "received",
      "received",
      "received"
    ])
    // A reused keep-alive connection and a fresh one are different facts about
    // the same origin, and the record tells them apart.
    expect(attempts.some((fields) => fields.reusedSocket === false)).toBe(true)
    expect(attempts.some((fields) => fields.reusedSocket === true)).toBe(true)
    // The first attempt opened a connection of its own, and the record says so.
    expect(attempts[0]?.connectBegan).toBe(1)
    expect(attempts[0]?.connectEnded).toBe(1)
    expect(attempts[0]?.errorName).toBeUndefined()
  })

  test("reports the bytes as sent when the origin takes them and answers nothing", async () => {
    // The production shape, with the one thing the old evidence could not say:
    // the request did reach a socket, so nothing above the origin is at fault.
    const origin = await startOrigin("silent")
    const observer = FetchTransport.observe(origin.baseUrl)
    const fields = await attemptOn(observer, origin.baseUrl)
    observer.close()
    expect(origin.received).toHaveLength(1)
    expect(fields.transport).toBe("sent")
  })

  test("reports headers as received when the origin answers its status and stops", async () => {
    // One message further on than the silent origin, and a different repair:
    // the bytes arrived, the origin accepted them, and the body is what never
    // came. An abort that lands after the headers must not read as an attempt
    // that never reached them.
    const origin = await startOrigin("headers-only")
    const observer = FetchTransport.observe(origin.baseUrl)
    const fields = await attemptOn(observer, origin.baseUrl)
    observer.close()
    expect(fields.transport).toBe("responded")
  })

  test("names the connection's own failure when nothing is listening", async () => {
    // A refused connection and a silent origin are the same pending record
    // without this: both are a request that never answers.
    const baseUrl = await closedBaseUrl()
    const observer = FetchTransport.observe(baseUrl)
    const fields = await attemptOn(observer, baseUrl)
    observer.close()
    expect(fields.transport).toBe("created")
    expect(fields.connectBegan).toBe(1)
    expect(fields.connectEnded).toBe(0)
    expect(fields.connectFailed).toBe(1)
    expect(fields.connectCode).toBe("ECONNREFUSED")
    expect(fields.errorCode).toBe("ECONNREFUSED")
    expect(typeof fields.errorName).toBe("string")
  })

  test("reports none when the request never reaches the dispatcher", async () => {
    // The strongest reading the old evidence was missing: no dispatcher record
    // at all means the request never left this process, so no connection,
    // proxy or origin can be blamed for it.
    const origin = await startOrigin()
    const observer = FetchTransport.observe(origin.baseUrl)
    const attempt = observer.begin()
    expect(await attempt.run(() => Promise.resolve("answered by a caller's own transport"))).toBe(
      "answered by a caller's own transport"
    )
    const fields = attempt.fields()
    observer.close()
    expect(fields).toEqual({ transport: "none" })
  })

  test("attributes nothing to an attempt from another origin's request or connection", async () => {
    const origin = await startOrigin()
    const other = await startOrigin()
    const observer = FetchTransport.observe(origin.baseUrl)
    const attempt = observer.begin()
    await attempt.run(() => post(other.baseUrl))
    const fields = attempt.fields()
    observer.close()
    // Another origin's request is not this attempt's, and neither is the
    // connection it opened.
    expect(fields).toEqual({ transport: "none" })
  })

  test("claims one request per attempt, so another fiber's request is not read as this one's", async () => {
    // Effect runs many fibers inside one scheduler task, so a request another
    // fiber dispatches can be created while this attempt's context is still
    // the ambient one. An attempt makes one request; the second is not its own
    // however much it looks like it.
    const origin = await startOrigin()
    const closed = await closedBaseUrl()
    const observer = FetchTransport.observe(origin.baseUrl)
    const attempt = observer.begin()
    await attempt.run(async () => {
      await post(origin.baseUrl)
      await post(closed).catch(() => undefined)
    })
    const fields = attempt.fields()
    observer.close()
    expect(fields.transport).toBe("received")
    expect(fields.errorCode).toBeUndefined()
    expect(fields.connectFailed).toBeUndefined()
  })

  test("stops attributing once closed, and two observers share one subscription", async () => {
    const origin = await startOrigin()
    const first = FetchTransport.observe(origin.baseUrl)
    const second = FetchTransport.observe(origin.baseUrl)
    const attempt = first.begin()
    const reached = await attempt.run(async () => {
      await post(origin.baseUrl)
      return attempt.fields()
    })
    expect(reached.transport).toBe("received")
    // An observer closed while another is open leaves the second one working;
    // an open attempt it never read is dropped rather than left in the set.
    const dropped = first.begin()
    first.close()
    const after = second.begin()
    await after.run(() => post(origin.baseUrl))
    expect(after.fields().transport).toBe("received")
    expect(dropped.fields()).toEqual({ transport: "none" })
    second.close()
    // With no observer left the channels are unsubscribed: a request made now
    // is attributed to nothing, even inside a new attempt.
    const silent = FetchTransport.observe(origin.baseUrl)
    const outside = silent.begin()
    silent.close()
    await outside.run(() => post(origin.baseUrl))
    expect(outside.fields()).toEqual({ transport: "none" })
  })

  test("a repeated close leaves another observer attributing", async () => {
    // The subscription is shared and taken down by the last observer to close.
    // Closing one twice must not count twice: it would drop the channels under
    // an observer that is still open, and its requests would then report
    // `none` — the reading that clears everything below the caller of a fault
    // that is in fact still unattributed.
    const origin = await startOrigin()
    const first = FetchTransport.observe(origin.baseUrl)
    const second = FetchTransport.observe(origin.baseUrl)
    first.close()
    first.close()
    const fields = await attemptOn(second, origin.baseUrl)
    second.close()
    expect(fields.transport).toBe("received")
  })

  test("an attempt begun after its observer closed claims no phase at all", async () => {
    // A closed observer is not watching, so its attempts report nothing rather
    // than `none`: the request may well have reached the dispatcher, and this
    // observer is in no position to say it did not.
    const origin = await startOrigin()
    const watching = FetchTransport.observe(origin.baseUrl)
    const closedObserver = FetchTransport.observe(origin.baseUrl)
    closedObserver.close()
    const attempt = closedObserver.begin()
    await attempt.run(() => post(origin.baseUrl))
    expect(attempt.fields()).toEqual({})
    // The observer still open is unaffected by the other's close.
    const live = watching.begin()
    await live.run(() => post(origin.baseUrl))
    expect(live.fields().transport).toBe("received")
    watching.close()
  })

  test("ignores every record of a request no attempt made", async () => {
    // A caller's other requests reach the same origin outside any attempt, and
    // a failure of one of them belongs to no attempt either.
    const origin = await startOrigin()
    const closed = await closedBaseUrl()
    const observer = FetchTransport.observe(origin.baseUrl)
    await post(origin.baseUrl)
    await post(closed).catch(() => undefined)
    const attempt = observer.begin()
    const fields = attempt.fields()
    observer.close()
    expect(fields).toEqual({ transport: "none" })
  })
})

describe("a dial's resolution", () => {
  test("records the name it resolved before the connection it opened", async () => {
    // `created` with one connection begun and none ended was two faults at
    // once: a name still in the resolver, and a SYN nothing answered. The
    // socket the dial created separates them, and a good request by name
    // shows both halves finishing.
    const origin = await startOrigin()
    const baseUrl = byName(origin.baseUrl)
    const observer = FetchTransport.observe(baseUrl)
    const fields = await attemptOn(observer, baseUrl)
    observer.close()
    expect(fields.transport).toBe("received")
    expect(fields.lookupBegan).toBe(1)
    expect(fields.lookupEnded).toBe(1)
    expect(fields.connectEnded).toBe(1)
    expect(fields.lookupCode).toBeUndefined()
  })

  test("separates a name that was answered from a connection that never came up", async () => {
    // The reading the production stall needed: the resolver finished and the
    // connection did not, so the fault is below the name and not in it.
    const closed = byName(await closedBaseUrl())
    const observer = FetchTransport.observe(closed)
    const fields = await attemptOn(observer, closed)
    observer.close()
    expect(fields.transport).toBe("created")
    expect(fields.lookupBegan).toBe(1)
    expect(fields.lookupEnded).toBe(1)
    expect(fields.lookupCode).toBeUndefined()
    expect(fields.connectEnded).toBe(0)
    expect(fields.connectCode).toBe("ECONNREFUSED")
  })

  test("records no resolution for a dial that has no name to resolve", async () => {
    // A dial to an address resolves nothing, and a resolution it never began
    // would read as one that never returned — the fault this record exists to
    // rule out. Its absence is also a fact: `created` with a connection begun
    // and no lookup is the connection, with nothing to blame on a resolver.
    const closed = await closedBaseUrl()
    const observer = FetchTransport.observe(closed)
    const fields = await attemptOn(observer, closed)
    observer.close()
    expect(fields.connectBegan).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(fields.lookupCode).toBeUndefined()
  })

  test("names a resolution that failed, apart from a connection that failed", async () => {
    // A name with no answer and a port with no listener are different faults
    // at different layers, and both ended as `created` before this record.
    // The code the resolver gave is the whole of what is kept.
    const baseUrl = "http://callback.invalid:8080"
    const observer = FetchTransport.observe(baseUrl)
    const fields = await attemptOn(observer, baseUrl, 5_000)
    observer.close()
    expect(fields.transport).toBe("created")
    expect(fields.lookupBegan).toBe(1)
    expect(fields.lookupEnded).toBe(1)
    expect(typeof fields.lookupCode).toBe("string")
    expect(fields.connectEnded).toBe(0)
  })

  test("claims no socket another origin's dial created", async () => {
    // `net.client.socket` names no origin, so a socket is this attempt's only
    // when the dispatcher created it in the same turn as the dial this
    // observer counted. Another origin's dial, by name, must leave no
    // resolution behind on this attempt.
    const origin = await startOrigin()
    const other = await startOrigin()
    const observer = FetchTransport.observe(origin.baseUrl)
    const attempt = observer.begin()
    await attempt.run(() => post(byName(other.baseUrl)))
    const fields = attempt.fields()
    observer.close()
    expect(fields).toEqual({ transport: "none" })
  })
})

describe("a dial a forward proxy carried", () => {
  // Every hosted guest reaches its journal through the sandbox's egress
  // proxy, and that is the one network shape none of the cases above cover.
  // Under a proxy the dispatcher dials the origin, hands that dial to a
  // connector, and the connector dials the PROXY — so the socket the dial
  // produced is the proxy's, and whatever it resolves is the proxy's name,
  // not the origin's. These cases replay the record order real transport
  // publishes in that shape, measured on the pinned Node 26.5.0 through a
  // real CONNECT proxy: a HEALTHY proxied request reported `lookupBegan: 1,
  // lookupEnded: 0`, which reads as a name still in the resolver. Publishing
  // on the dispatcher's own channels is the subscriber's real seam; the proxy
  // is the part that cannot be raised inside one coverage-instrumented
  // process.
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
   * One attempt through a proxy, in the dispatcher's own order: the origin's
   * request and dial, then the proxy's request and dial, then the one socket
   * the connector created, then both connections and the answer.
   */
  const proxiedAttempt = (origin: string, proxyOrigin: string, resolves: ReadonlyArray<string>) => {
    const observer = FetchTransport.observe(origin)
    const attempt = observer.begin()
    const request = { origin, path: "/internal/chat/commit" }
    const dialled = socketFor(resolves)
    attempt.run(() => {
      create.publish({ request })
      beforeConnect.publish(dialOf(origin))
      create.publish({ request: { origin: proxyOrigin, path: new URL(origin).host } })
      beforeConnect.publish(dialOf(proxyOrigin))
      clientSocket.publish({ socket: dialled.socket })
      connected.publish(dialOf(proxyOrigin))
      connected.publish(dialOf(origin))
      sendHeaders.publish({ request, socket: {} })
      headers.publish({ request })
      trailers.publish({ request })
      return Promise.resolve()
    })
    const fields = attempt.fields()
    observer.close()
    return { fields, asked: dialled.asked }
  }

  test("reports no resolution of its own when the proxy is an address", () => {
    // The measured production-shaped reading. The connection counts are the
    // origin's own and stay; the resolution is the proxy's and must not be
    // claimed, because an address resolves nothing and `lookupBegan` without
    // `lookupEnded` would read as the origin's name stuck in the resolver.
    const { asked, fields } = proxiedAttempt("http://journal.invalid:8080", "http://127.0.0.1:41038", [])
    expect(fields.transport).toBe("received")
    expect(fields.connectBegan).toBe(1)
    expect(fields.connectEnded).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(asked).toEqual([])
  })

  test("does not read the proxy's own resolution as the origin's", () => {
    // A guest's proxy is itself named (`host.microsandbox.internal`), so the
    // socket the connector created does resolve a name — the proxy's. Reading
    // it as the origin's would report a resolution this process never made
    // and would carry the proxy's resolver failure under the origin's code.
    const { asked, fields } = proxiedAttempt("http://journal.invalid:8080", "http://proxy.invalid:41038", ["lookup"])
    expect(fields.transport).toBe("received")
    expect(fields.connectBegan).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(fields.lookupCode).toBeUndefined()
    expect(asked).toEqual([])
  })

  test("records no resolution when a proxy carried the request absolute-form", () => {
    // The proxy's other shape: an `http` origin under `NODE_USE_ENV_PROXY=1`
    // is not tunnelled. The dispatcher names the PROXY as the request's origin
    // and carries the origin's URL as the path, so the single dial it
    // publishes is the proxy's and the socket resolves the proxy's name.
    // Measured on the pinned Node 26.5.0 through a real NAMED proxy: a healthy
    // request still reported `lookupBegan 1, lookupEnded 1`, which reads as
    // the origin's name and is the proxy's. The connection counts are that
    // hop's on purpose and stay.
    const origin = "http://journal.invalid:8080"
    const proxyOrigin = "http://proxy.invalid:41038"
    const observer = FetchTransport.observe(origin)
    const attempt = observer.begin()
    const request = { origin: proxyOrigin, path: `${origin}/internal/chat/commit` }
    const dialled = socketFor(["lookup"])
    attempt.run(() => {
      create.publish({ request })
      beforeConnect.publish(dialOf(proxyOrigin))
      clientSocket.publish({ socket: dialled.socket })
      connected.publish(dialOf(proxyOrigin))
      sendHeaders.publish({ request, socket: {} })
      headers.publish({ request })
      trailers.publish({ request })
      return Promise.resolve()
    })
    const fields = attempt.fields()
    observer.close()
    expect(fields.transport).toBe("received")
    expect(fields.connectBegan).toBe(1)
    expect(fields.connectEnded).toBe(1)
    expect(fields.lookupBegan).toBeUndefined()
    expect(fields.lookupEnded).toBeUndefined()
    expect(dialled.asked).toEqual([])
  })

  test("still separates a name from a connection for a dial this process makes itself", () => {
    // The reading the proxy case gives up must survive where it is sound: an
    // unproxied dial by name still records both halves of its resolution.
    const origin = "http://journal.invalid:8080"
    const observer = FetchTransport.observe(origin)
    const attempt = observer.begin()
    const request = { origin, path: "/internal/chat/commit" }
    const dialled = socketFor(["lookup"])
    attempt.run(() => {
      create.publish({ request })
      beforeConnect.publish(dialOf(origin))
      clientSocket.publish({ socket: dialled.socket })
      return Promise.resolve()
    })
    const fields = attempt.fields()
    observer.close()
    expect(fields.lookupBegan).toBe(1)
    expect(fields.lookupEnded).toBe(1)
    expect(dialled.asked).toEqual(["lookup"])
  })
})

describe("two requests to one origin in flight at once", () => {
  // Production's own overlap: turn 2d851bdd answered `first_event` at 2126 ms
  // and began `commit` at 2127 ms. Measured on the pinned Node 26.5.0 through
  // a real CONNECT proxy, two concurrent requests to one origin open TWO
  // tunnels rather than queueing on one, so the second one's dial arrives
  // while the first is still open and was counted by it. These publish the
  // dispatcher's records in that measured order.
  const create = channel("undici:request:create")
  const beforeConnect = channel("undici:client:beforeConnect")
  const connected = channel("undici:client:connected")
  const connectError = channel("undici:client:connectError")
  const sendHeaders = channel("undici:client:sendHeaders")
  const headers = channel("undici:request:headers")
  const trailers = channel("undici:request:trailers")

  const dialOf = (origin: string) => {
    const { host, hostname } = new URL(origin)
    return { connectParams: { host, hostname } }
  }

  const origin = "http://journal.invalid:8080"

  test("does not count a later request's connection against one that already has its socket", () => {
    const observer = FetchTransport.observe(origin)
    const first = observer.begin()
    const second = observer.begin()
    const firstRequest = { origin, path: "/internal/chat/first_event" }
    const secondRequest = { origin, path: "/internal/chat/commit" }
    first.run(() => {
      create.publish({ request: firstRequest })
      beforeConnect.publish(dialOf(origin))
      connected.publish(dialOf(origin))
      sendHeaders.publish({ request: firstRequest, socket: {} })
      headers.publish({ request: firstRequest })
      trailers.publish({ request: firstRequest })
      return Promise.resolve()
    })
    // The second request begins while the first attempt is still open, and
    // opens its own connection.
    second.run(() => {
      create.publish({ request: secondRequest })
      beforeConnect.publish(dialOf(origin))
      connected.publish(dialOf(origin))
      return Promise.resolve()
    })
    const firstFields = first.fields()
    const secondFields = second.fields()
    observer.close()
    // The answered request reports the one connection it waited for. Counting
    // the second's dial as well reported two begun and one ended on a body
    // that had already ended, which reads as a connection that never came up.
    expect(firstFields.transport).toBe("received")
    expect(firstFields.connectBegan).toBe(1)
    expect(firstFields.connectEnded).toBe(1)
    expect(secondFields.transport).toBe("created")
    expect(secondFields.connectBegan).toBe(1)
    expect(secondFields.connectEnded).toBe(1)
  })

  test("keeps the waiting request's own unfinished connection, and leaves the answered one out of it", () => {
    // The reading the count exists for has to survive the correction: a
    // request still at `created` with a connection begun and none ended is the
    // hop that has not come up, and the attempt that already answered must
    // carry neither that dial nor its failure.
    const observer = FetchTransport.observe(origin)
    const answered = observer.begin()
    const waiting = observer.begin()
    const answeredRequest = { origin, path: "/internal/chat/first_event" }
    const waitingRequest = { origin, path: "/internal/chat/commit" }
    answered.run(() => {
      create.publish({ request: answeredRequest })
      beforeConnect.publish(dialOf(origin))
      connected.publish(dialOf(origin))
      sendHeaders.publish({ request: answeredRequest, socket: {} })
      headers.publish({ request: answeredRequest })
      trailers.publish({ request: answeredRequest })
      return Promise.resolve()
    })
    waiting.run(() => {
      create.publish({ request: waitingRequest })
      beforeConnect.publish(dialOf(origin))
      connectError.publish({ ...dialOf(origin), error: { code: "ECONNREFUSED" } })
      return Promise.resolve()
    })
    const answeredFields = answered.fields()
    const waitingFields = waiting.fields()
    observer.close()
    expect(answeredFields.connectBegan).toBe(1)
    expect(answeredFields.connectFailed).toBeUndefined()
    expect(answeredFields.connectCode).toBeUndefined()
    expect(waitingFields.transport).toBe("created")
    expect(waitingFields.connectBegan).toBe(1)
    expect(waitingFields.connectEnded).toBe(0)
    expect(waitingFields.connectFailed).toBe(1)
    expect(waitingFields.connectCode).toBe("ECONNREFUSED")
  })
})

describe("the runtime an observer names", () => {
  test("is this process's Node build, as version strings", () => {
    // The build fixes the bundled `undici` every `fetch` goes through, which
    // is the one variable the transport readings cannot control for.
    const observer = FetchTransport.observe("http://journal.invalid:8080")
    observer.close()
    expect(observer.runtime).toEqual({
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    })
  })
})
