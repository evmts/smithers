import { Effect, Fiber } from "effect"
import { describe, expect, test } from "vitest"
import { GitRemote } from "../src/index.ts"
import { brokenBody, httpClient, telemetry } from "./fixtures.ts"

// A scripted git host on the `fetch` seam, answering `info/refs` the way GitHub does (checked against
// github.com/octocat/Spoon-Knife on 2026-10-19): the service line, a flush, then HEAD with its capabilities.

const SHA = "d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9"
const ADVERTISEMENT = "application/x-git-upload-pack-advertisement"

const encoder = new TextEncoder()
/** A pkt-line: its 4-hex-digit length counts the line's UTF-8 bytes plus the 4 of the length itself. */
const pkt = (line: string) => `${(encoder.encode(line).length + 4).toString(16).padStart(4, "0")}${line}`
/** A pkt-line from raw payload bytes, which need not be UTF-8. */
const rawPkt = (payload: Uint8Array) =>
  new Uint8Array([...encoder.encode((payload.length + 4).toString(16).padStart(4, "0")), ...payload])
const advertisement = (...refs: Array<string>) =>
  `${pkt("# service=git-upload-pack\n")}0000${refs.map(pkt).join("")}0000`
const headLine = (capabilities: string, sha = SHA) =>
  `${sha} HEAD\0multi_ack thin-pack side-band ofs-delta ${capabilities} agent=git/github\n`

/** Bytes as a stream of `size`-byte chunks, then (when `endless`) chunks of more refs forever, counted in `extra`. */
const trickle = (text: string, endless = false, size = 1) => {
  const bytes = encoder.encode(text)
  let index = 0
  const stream = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (index < bytes.length) controller.enqueue(bytes.subarray(index, index += size))
      else if (endless) {
        stream.extra++
        controller.enqueue(encoder.encode(pkt(`${SHA} refs/pull/1/head\n`)))
      } else controller.close()
    }
  }) as ReadableStream<Uint8Array> & { extra: number }
  stream.extra = 0
  return stream
}

/** Bytes as a stream of chunks cut at the byte offsets `cuts`, which may fall inside a header or a code point. */
const cutAt = (bytes: Uint8Array, ...cuts: Array<number>) => {
  const bounds = [0, ...cuts, bytes.length]
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (let index = 1; index < bounds.length; index++) {
        controller.enqueue(bytes.slice(bounds[index - 1], bounds[index]))
      }
      controller.close()
    }
  })
}

const host = (answer: (url: URL) => Response | "throw") => {
  const seen: Array<URL> = []
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    seen.push(url)
    const response = answer(url)
    if (response === "throw") throw new TypeError("fetch failed")
    return response
  }
  return { fetch, seen }
}

const read = (answer: (url: URL) => Response | "throw", remote = "https://github.com/octocat/Spoon-Knife.git") => {
  const { fetch, seen } = host(answer)
  const recorded = telemetry()
  const run = Effect.runPromise(
    recorded.provide(Effect.result(GitRemote.head(remote)).pipe(Effect.provide(httpClient(fetch))))
  )
  return { run, seen, recorded }
}

const ok = (body: string | ReadableStream<Uint8Array>, type = ADVERTISEMENT) =>
  new Response(body, { status: 200, headers: { "content-type": type } })

describe("GitRemote.head", () => {
  test("reads HEAD's commit and branch from the first ref line, asking for upload-pack's advertisement", async () => {
    const { run, seen, recorded } = read(
      () => ok(advertisement(headLine("symref=HEAD:refs/heads/main"))),
      "https://github.com/o/n.git/"
    )
    expect(await run).toMatchObject({ _tag: "Success", success: { sha: SHA, branch: "main" } })
    expect(seen[0]!.href).toBe("https://github.com/o/n.git/info/refs?service=git-upload-pack")
    expect(recorded.count(GitRemote.requests, { outcome: "ok" })).toBe(1)
    const span = recorded.spans.find((each) => each.name === "GitRemote.head")!
    expect(span.attributes.get("git.remote")).toBe("https://github.com/o/n.git/")
  })

  test("a branch name with slashes, and a SHA-256 repository", async () => {
    const sha256 = "a".repeat(64)
    const { run } = read(() => ok(advertisement(headLine("symref=HEAD:refs/heads/release/1.0", sha256))))
    expect(await run).toMatchObject({ success: { sha: sha256, branch: "release/1.0" } })
  })

  test("Unicode branch names frame by bytes, however the network cuts the advertisement", async () => {
    // Pkt-line lengths count bytes. Each branch below is longer in UTF-8 bytes than in JavaScript string units, and
    // the next ref packet sits right behind HEAD, so framing by string offsets would cut HEAD short or eat that packet.
    for (const branch of ["日本語", "feature/🚀", "cafe\u0301", "e\u0301\u0301x", "a\u3000b", "a\u00a0b"]) {
      const body = encoder.encode(
        advertisement(headLine(`symref=HEAD:refs/heads/${branch}`), `${SHA} refs/heads/${branch}\n`)
      )
      const expected = { success: { sha: SHA, branch } }
      expect(await read(() => ok(cutAt(body))).run, branch).toMatchObject(expected)
      expect(await read(() => ok(trickle(new TextDecoder().decode(body)))).run, branch).toMatchObject(expected)
      // Two chunks, cut at every byte offset: inside a length header, inside a code point, on a packet boundary.
      for (let cut = 1; cut < body.length; cut++) {
        expect(await read(() => ok(cutAt(body, cut))).run, `${branch} cut at ${cut}`).toMatchObject(expected)
      }
    }
  })

  test("a packet that isn't UTF-8 is invalid_response; a packet after HEAD is never decoded", async () => {
    const flush = encoder.encode("0000")
    /** An advertisement whose HEAD line holds `bytes` where the branch goes, framed by their true length. */
    const rawHead = (...bytes: Array<number>) =>
      new Uint8Array([
        ...encoder.encode(`${pkt("# service=git-upload-pack\n")}0000`),
        ...rawPkt(new Uint8Array([...encoder.encode(`${SHA} HEAD\0symref=HEAD:refs/heads/`), ...bytes, 0x0a])),
        ...flush
      ])
    const bodies = [
      // A lone continuation byte, an invalid lead byte, and a code point cut short inside a whole packet.
      rawHead(0x80),
      rawHead(0xff),
      rawHead(...encoder.encode("日").subarray(0, 2)),
      // The service line itself isn't UTF-8.
      new Uint8Array([...rawPkt(new Uint8Array([...encoder.encode("# service=git-upload-pack"), 0xc3])), ...flush])
    ]
    for (const body of bodies) {
      for (const stream of [cutAt(body), cutAt(body, body.length - 7)]) {
        const { run, recorded } = read(() => ok(stream))
        expect(await run).toMatchObject({ failure: { code: "invalid_response", status: 200 } })
        expect(recorded.count(GitRemote.requests, { outcome: "invalid_response" })).toBe(1)
      }
    }
    const later = new Uint8Array([
      ...encoder.encode(`${pkt("# service=git-upload-pack\n")}0000${pkt(headLine("symref=HEAD:refs/heads/main"))}`),
      ...rawPkt(new Uint8Array([...encoder.encode(`${SHA} refs/heads/`), 0xff, 0x0a])),
      ...flush
    ])
    expect(await read(() => ok(cutAt(later))).run).toMatchObject({ success: { sha: SHA, branch: "main" } })
  })

  test("a detached HEAD has no branch", async () => {
    const { run } = read(() => ok(advertisement(headLine("ofs-delta"))))
    expect(await run).toMatchObject({ success: { sha: SHA, branch: undefined } })
  })

  test("stops reading after the first ref line, so an endless advertisement answers after reading HEAD", async () => {
    const body = trickle(advertisement(headLine("symref=HEAD:refs/heads/main")).slice(0, -4), true)
    const { run } = read(() => ok(body))
    expect(await run).toMatchObject({ success: { sha: SHA, branch: "main" } })
    // The stream reads ahead at most a chunk or two past HEAD, never the 64 KiB cap's worth of refs.
    expect(body.extra).toBeLessThanOrEqual(2)
  })

  test("a repository with no commits, no refs, or refs but no HEAD is empty", async () => {
    const zero = "0".repeat(40)
    for (
      const body of [
        advertisement(`${zero} capabilities^{}\0multi_ack\n`),
        advertisement(),
        advertisement(`${SHA} refs/heads/main\0multi_ack\n`)
      ]
    ) {
      const { run, recorded } = read(() => ok(body))
      expect(await run).toMatchObject({ failure: { code: "empty", status: 200 } })
      expect(recorded.count(GitRemote.requests, { outcome: "empty" })).toBe(1)
    }
  })

  test("401, 403 and 404 are not_found; another failing status is unavailable with the status", async () => {
    for (const status of [401, 403, 404]) {
      const { run } = read(() => new Response("Repository not found.", { status }))
      expect(await run).toMatchObject({ failure: { code: "not_found", status } })
    }
    const { run } = read(() => new Response(null, { status: 502 }))
    const failure = (await run as { failure: GitRemote.GitRemoteError }).failure
    expect(failure).toMatchObject({ code: "unavailable", status: 502 })
    expect(failure.message).toBe("git remote HEAD: unavailable (502)")
  })

  test("an answer that isn't a smart HTTP advertisement is invalid_response", async () => {
    const bodies: Array<Response> = [
      ok(advertisement(headLine("")), "text/plain"),
      new Response(trickle(advertisement(headLine(""))), { status: 200 }),
      ok("zzzz"),
      ok("0002"),
      ok(`${pkt("not the service\n")}0000`),
      ok(`0000${pkt("# service=git-upload-pack\n")}`),
      ok(`${pkt("# service=git-upload-pack\n")}${pkt("x\n")}`),
      ok(`${pkt("# service=git-upload-pack\n")}0000${pkt("not a ref line\n")}`),
      // A byte order mark is kept, not stripped, so it can't pass for the service line.
      ok(`${pkt("\ufeff# service=git-upload-pack\n")}0000${pkt(headLine(""))}0000`),
      // The first ref packet never completes inside the 64 KiB cap.
      ok(trickle(`${pkt("# service=git-upload-pack\n")}0000fff0${"a".repeat(70_000)}`, false, 4096))
    ]
    for (const body of bodies) {
      const { run } = read(() => body)
      expect(await run).toMatchObject({ failure: { code: "invalid_response" } })
    }
  })

  test("an advertisement that ends before HEAD, at each step, is invalid_response", async () => {
    for (const body of ["", pkt("# service=git-upload-pack\n"), `${pkt("# service=git-upload-pack\n")}0000`]) {
      const { run } = read(() => ok(body))
      expect(await run).toMatchObject({ failure: { code: "invalid_response" } })
    }
  })

  test("no answer, or an answer that breaks off, is transport", async () => {
    const thrown = read(() => "throw")
    expect(await thrown.run).toMatchObject({ failure: { code: "transport" } })
    expect((await thrown.run as { failure: GitRemote.GitRemoteError }).failure.message).toBe(
      "git remote HEAD: transport"
    )
    const broken = read(() => ok(brokenBody("001e")))
    expect(await broken.run).toMatchObject({ failure: { code: "transport", status: 200 } })
  })

  test("a read interrupted mid-flight counts as interrupted", async () => {
    let started!: () => void
    const waiting = new Promise<void>((resolve) => (started = resolve))
    const fetch: typeof globalThis.fetch = (input) =>
      new Promise<Response>((_, reject) => {
        started()
        ;(input as Request).signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      })
    const recorded = telemetry()
    await Effect.runPromise(recorded.provide(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(GitRemote.head("https://github.com/o/n.git"))
        yield* Effect.promise(() => waiting)
        yield* Fiber.interrupt(fiber)
      }).pipe(Effect.provide(httpClient(fetch)))
    ))
    expect(recorded.count(GitRemote.requests, { outcome: "interrupted" })).toBe(1)
  })
})
