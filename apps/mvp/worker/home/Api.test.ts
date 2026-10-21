import { Logger as StructuredLogger } from "@smthrs/observability"
import { Home } from "@smthrs/views"
import { Effect, Layer, Logger, Metric, Schema, Tracer } from "effect"
import { HttpEffect } from "effect/http"
import { describe, expect, test } from "vitest"
import { HomeAnswer } from "../../src/features/home/schema.ts"
import * as Actor from "../Actor.ts"
import { signedIn } from "../test/harness.ts"
import { handles, make, parseHomePath, requests } from "./Api.ts"
import * as Curated from "./Curated.ts"

// `GET /api/repos/<owner>/<name>/home`: who the asker is and the curated home, with only the sections their audience
// may see. The handler runs as ChatApi runs it, with who is asking from a `Sessions` layer: signed out, each role, or
// a session store that can't answer (test.faults-by-injection).

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

const person = (role: Actor.Role | null): Actor.Actor => ({ subject: { kind: "person", id: "p1" }, role })

const unavailable = Layer.succeed(
  Actor.Sessions,
  Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) }),
)

/** The route over `sessions` and `files`, recording what it logs, spans and counts. */
const route = (sessions: Layer.Layer<Actor.Sessions> = Actor.signedOut, files?: ReadonlyArray<Curated.CuratedFile>) => {
  const logs: Array<StructuredLog> = []
  const spans: Array<Tracer.NativeSpan> = []
  const registry: Metric.MetricRegistry = new Map()
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const handler = HttpEffect.toWebHandler(
    make(files).fetch.pipe(
      Effect.provide(sessions),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provideService(Logger.CurrentLoggers, new Set([Logger.make((log) => void logs.push(StructuredLogger.formatStructured.log(log)))])),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  )
  return {
    get: (path: string, init?: RequestInit) => handler(new Request(`http://chat.test${path}`, init)),
    logs,
    spans,
    count: (attributes: Record<string, string>) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(requests, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
      ).count,
  }
}

const EFFECT = "/api/repos/Effect-TS/effect/home"

const answerOf = async (response: Response) => Schema.decodeUnknownSync(HomeAnswer)(await response.json())

/** Each section the answer holds, as `audience:title`. */
const shape = (answer: HomeAnswer) =>
  answer.curated === null ? null : answer.curated.sections.map((section) => `${section.audience}:${section.title ?? ""}`)

describe("GET /api/repos/<owner>/<name>/home", () => {
  test("signed out: everyone's audience, and only everyone's sections of the curated home", async () => {
    const r = route()
    const response = await r.get(EFFECT)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("vary")).toBe("cookie")
    const text = await response.clone().text()
    const answer = await answerOf(response)
    expect(answer.audience).toBe("everyone")
    expect(answer.curated?.defaultBranch).toBe("main")
    expect(shape(answer)).toEqual(["everyone:"])
    // Nothing of the Maintainers' or Members' sections reaches the browser: not a title, not a block.
    for (const hidden of ["Today", "Your work", "\"issues\"", "\"runs\"", "\"stack\""]) expect(text).not.toContain(hidden)
  })

  test("each role sees its own sections and the wider ones, in the file's order", async () => {
    const seen = async (role: Actor.Role | null) => shape(await answerOf(await route(signedIn(person(role))).get(EFFECT)))
    expect(await seen(null)).toEqual(["everyone:"])
    expect(await seen("guest")).toEqual(["contributor:Your work", "everyone:"])
    expect(await seen("member")).toEqual(["contributor:Your work", "everyone:"])
    expect(await seen("maintainer")).toEqual(["maintainer:Today", "contributor:Your work", "everyone:"])
    expect(await seen("admin")).toEqual(["maintainer:Today", "contributor:Your work", "everyone:"])
    const answer = await answerOf(await route(signedIn(person("maintainer"))).get(EFFECT))
    expect(answer.audience).toBe("maintainer")
  })

  test("a curated home open to anyone shows its contributors' sections to a visitor, never its maintainers'", async () => {
    const files: ReadonlyArray<Curated.CuratedFile> = [{
      repository: "maya/tinyhttp",
      defaultBranch: "main",
      home: {
        contributors: "anyone",
        sections: [
          { title: "Today", audience: "maintainer", blocks: [{ type: "runs" }] },
          { title: "Contribute", audience: "contributor", blocks: [{ type: "stack" }] },
          { blocks: [{ type: "text", text: "Hi" }] },
        ],
      },
    }]
    const answer = await answerOf(await route(Actor.signedOut, files).get("/api/repos/maya/tinyhttp/home"))
    expect([answer.audience, shape(answer)]).toEqual(["contributor", ["contributor:Contribute", "everyone:"]])
    const maintainer = await answerOf(await route(signedIn(person("admin")), files).get("/api/repos/maya/tinyhttp/home"))
    expect(maintainer.audience).toBe("maintainer")
  })

  test("names compare without case, as GitHub's do", async () => {
    const answer = await answerOf(await route().get("/api/repos/effect-ts/EFFECT/home"))
    expect(answer.curated?.defaultBranch).toBe("main")
  })

  test("a repository Smithers has no home for: the audience, and no curated home", async () => {
    const r = route(signedIn(person("member")))
    expect(await answerOf(await r.get("/api/repos/octocat/Spoon-Knife/home"))).toEqual({ audience: "contributor", curated: null })
    expect(r.count({ outcome: "absent", audience: "contributor" })).toBe(1)
  })

  test("a curated file that isn't a home answers none, and says so in its records", async () => {
    const files: ReadonlyArray<Curated.CuratedFile> = [
      { repository: "maya/tinyhttp", defaultBranch: "main", home: { blocks: [{ type: "text", text: "<b>no</b>" }] } },
    ]
    const r = route(Actor.signedOut, files)
    expect(await answerOf(await r.get("/api/repos/maya/tinyhttp/home"))).toEqual({ audience: "everyone", curated: null })
    expect(r.logs.find((log) => log.message === "home.curated")).toMatchObject({
      level: "WARN",
      annotations: { outcome: "invalid", audience: "everyone", status: 200 },
    })
  })

  test("a session store that can't answer is 503, to be asked again", async () => {
    const r = route(unavailable)
    const response = await r.get(EFFECT)
    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("5")
    expect(await response.json()).toEqual({ code: "unavailable" })
    expect(r.count({ outcome: "unavailable", audience: "none" })).toBe(1)
  })

  test("only GET", async () => {
    const r = route()
    const response = await r.get(EFFECT, { method: "POST" })
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
    expect(r.count({ outcome: "method", audience: "none" })).toBe(1)
  })

  test("records an outcome, the audience and counts: one span, one line, one count, never a section's words", async () => {
    const r = route(signedIn(person("member")))
    await r.get(EFFECT)
    const lines = r.logs.filter((log) => log.message === "home.curated")
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      level: "INFO",
      annotations: { outcome: "curated", audience: "contributor", sections: 2, hidden: 1, status: 200 },
    })
    expect(r.spans.map((span) => span.name)).toEqual(["home.curated"])
    expect(Object.fromEntries(r.spans[0]!.attributes)).toMatchObject({
      "smithers.home.outcome": "curated",
      "smithers.home.audience": "contributor",
    })
    expect(r.count({ outcome: "curated", audience: "contributor" })).toBe(1)
    const records = JSON.stringify({ logs: r.logs, spans: r.spans.map((span) => [...span.attributes]) })
    for (const words of ["Your work", "Effect", "npm install"]) expect(records).not.toContain(words)
  })
})

describe("the home route's path", () => {
  test("names a repository's home, and nothing else", () => {
    expect(parseHomePath("/api/repos/Effect-TS/effect/home")).toEqual({ owner: "Effect-TS", name: "effect" })
    expect(parseHomePath("/api/repos/a%2Db/c.d/home")).toEqual({ owner: "a-b", name: "c.d" })
    for (const path of [
      "/api/repos/Effect-TS/effect",
      "/api/repos/Effect-TS/effect/home/x",
      "/api/repos/Effect-TS/effect/stack",
      "/api/repos/Effect-TS/home",
      "/api/repositories/a/b/home",
      "/api/repos/-bad/x/home",
      "/api/repos/%E0%A4%A/x/home",
    ]) {
      expect([path, parseHomePath(path), handles(path)]).toEqual([path, undefined, false])
    }
    expect(handles("/api/repos/maya/tinyhttp/home")).toBe(true)
  })
})

describe("the curated homes", () => {
  test("every file reads as a home, skips nothing, and its repository is unique", () => {
    const names = Curated.files.map((file) => file.repository.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const file of Curated.files) {
      const read = Home.read(JSON.stringify(file.home))
      expect([file.repository, read._tag, read._tag === "Declared" ? read.skipped : null]).toEqual([
        file.repository,
        "Declared",
        0,
      ])
      expect(file.defaultBranch).not.toBe("")
    }
  })

  test("Effect's home: a landing page for everyone, work for contributors, and the day for Maintainers", () => {
    const effect = Curated.find("Effect-TS", "effect")
    if (effect === undefined || effect === "invalid") throw new Error("Effect's curated home doesn't read")
    const kinds = (audience: Home.Audience) =>
      effect.sections.filter((section) => section.audience === audience).flatMap((section) => section.blocks.map((block) => block.type))
    expect(kinds("everyone")).toEqual(["hero", "code", "stats", "cards", "cards", "cards", "releases", "links", "prompt"])
    expect(kinds("contributor")).toEqual(["prompt", "stack", "flows", "app", "app"])
    expect(kinds("maintainer")).toEqual(["action", "issues", "runs"])
  })

  test("find: none for a repository it doesn't hold, and invalid for a file that isn't a home", () => {
    expect(Curated.find("octocat", "Spoon-Knife")).toBeUndefined()
    const files = [{ repository: "a/b", defaultBranch: "main", home: { blocks: [{ type: "board" }] } }]
    // A kind this reader doesn't know is skipped in a repository's own home; in a curated one it is a mistake.
    expect(Curated.find("a", "b", files)).toBe("invalid")
    expect(Curated.find("a", "b", [{ ...files[0]!, home: "not a home" }])).toBe("invalid")
  })
})
