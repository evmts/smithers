import { Home } from "@smthrs/views"
import { Clock, Effect, Metric, Option } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { audienceOf, HOME_SEGMENT } from "../../src/features/home/contract.ts"
import type { HomeAnswer } from "../../src/features/home/schema.ts"
import { isRepository, repoId, REPOS_ROUTE } from "../../src/features/repo/contract.ts"
import { Sessions } from "../Actor.ts"
import * as Curated from "./Curated.ts"

// `GET /api/repos/<owner>/<name>/home` (docs/features/home.md#who-sees-what): who the asker is on the repository, and
// Smithers' curated home for it with only the sections that audience may see. The server decides the audience from
// the session (a Maintainer or Admin is a maintainer, anyone else with a role a contributor, the rest everyone, or a
// contributor too when the curated home opens to anyone), so a section above it never reaches the browser; a live
// block's rows are read through their own shapes, which check the role again. Anyone may ask, signed out included.
// Never cached: the answer depends on the session.
//
// A session's role is the person's role on one repository, the one sign-in reads roles on (`GITHUB_REPOSITORY`,
// docs/features/sign-in.md#roles-and-role-checks). It counts only there: on any other repository the asker has no role.
//
// Each request is one span and log line `home.curated` and one count, with its outcome, the audience and how many
// sections it sent and held back; never a section, a block or a name.

/** `GET .../home` requests, by `outcome` and `audience`. */
export const requests = Metric.counter("smithers_home_curated_requests", {
  description: "GET /api/repos/<owner>/<name>/home requests, by outcome and audience",
  incremental: true,
})

/** The repository a home route names, from `/api/repos/<owner>/<name>/home`; none for any other path. */
export const parseHomePath = (path: string): { readonly owner: string; readonly name: string } | undefined => {
  if (!path.startsWith(`${REPOS_ROUTE}/`)) return undefined
  const segments = path.slice(REPOS_ROUTE.length + 1).split("/")
  if (segments.length !== 3 || segments[2] !== HOME_SEGMENT) return undefined
  try {
    const owner = decodeURIComponent(segments[0]!)
    const name = decodeURIComponent(segments[1]!)
    return isRepository(owner, name) ? { owner, name } : undefined
  } catch {
    return undefined
  }
}

/** Whether a path is the home route. */
export const handles = (path: string): boolean => parseHomePath(path) !== undefined

const headers = { "cache-control": "no-store", vary: "cookie" }

/** What the route serves: the repository roles are read on, and the curated homes. */
export interface Options {
  /** The repository sign-in reads roles on (`GITHUB_REPOSITORY`): a session's role counts on it alone. */
  readonly roles: { readonly id: string }
  /** The curated homes: worker/home/curated/ unless a test gives its own. */
  readonly files?: ReadonlyArray<Curated.CuratedFile>
}

/** The route. It reads who is asking from `Sessions`. */
export const make = ({ roles, files = Curated.files }: Options) => ({
  fetch: Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = yield* Clock.currentTimeMillis
    const target = parseHomePath(request.url.split("?")[0]!)!
    const record = (
      response: HttpServerResponse.HttpServerResponse,
      fields: {
        readonly outcome: string
        readonly audience?: Home.Audience
        readonly sections?: number
        readonly hidden?: number
        readonly rolesHere?: boolean
      },
    ) =>
      Effect.gen(function* () {
        const durationMs = (yield* Clock.currentTimeMillis) - startedAt
        const audience = fields.audience ?? "none"
        yield* Metric.update(Metric.withAttributes(requests, { outcome: fields.outcome, audience }), 1)
        yield* Effect.annotateCurrentSpan({ "smithers.home.outcome": fields.outcome, "smithers.home.audience": audience })
        yield* Effect.logWithLevel(fields.outcome === "unavailable" || fields.outcome === "invalid" ? "Warn" : "Info")(
          "home.curated",
        ).pipe(Effect.annotateLogs({ ...fields, status: response.status, durationMs }))
        return response
      })
    if (request.method !== "GET") {
      return yield* record(HttpServerResponse.empty({ status: 405, headers: { allow: "GET" } }), { outcome: "method" })
    }
    const actor = yield* Effect.result((yield* Sessions).resolve)
    if (actor._tag === "Failure") {
      return yield* record(
        HttpServerResponse.jsonUnsafe({ code: "unavailable" }, { status: 503, headers: { ...headers, "retry-after": "5" } }),
        { outcome: "unavailable" },
      )
    }
    const onRoles = repoId(target.owner, target.name) === roles.id
    const role = audienceOf(
      Option.match(actor.success, { onNone: () => null, onSome: (signed) => (onRoles ? signed.role : null) }),
    )
    const found = Curated.find(target.owner, target.name, files)
    if (found === undefined || found === "invalid") {
      const audience = role
      const answer: HomeAnswer = { audience, curated: null }
      return yield* record(HttpServerResponse.jsonUnsafe(answer, { headers }), {
        outcome: found === undefined ? "absent" : "invalid",
        audience,
        rolesHere: onRoles,
      })
    }
    const audience = Home.widen(role, found.contributors)
    const sections = Home.visible(found.sections, audience)
    const answer: HomeAnswer = {
      audience,
      curated: {
        defaultBranch: found.defaultBranch,
        sections,
        ...(found.docs === undefined ? {} : { docs: found.docs }),
      },
    }
    return yield* record(HttpServerResponse.jsonUnsafe(answer, { headers }), {
      outcome: "curated",
      audience,
      sections: sections.length,
      hidden: found.sections.length - sections.length,
      rolesHere: onRoles,
    })
  }).pipe(Effect.withSpan("home.curated")),
})
