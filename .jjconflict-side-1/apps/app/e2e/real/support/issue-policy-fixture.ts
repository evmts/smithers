import type { APIRequestContext, Page } from "@playwright/test"
import {
  FACTORY_PROJECTION_PATH,
  FactoryIssueTransitionSchema,
  FactoryProjectionSchema,
  issueTransitionNeedsPerson,
  issueTransitionOf,
  type FactoryIssueTransition
} from "@smthrs/rpc/FactoryProjection"
import { expect, realApi } from "./test"
import { repositoryApiPath } from "../repositories-github/production"

/**
 * The DECLARED REFERENCE FIXTURE for `issues.transition` (M-47, #4027), and
 * the doors the real scenario reads it back through.
 *
 * `issues.transition` runs a workflow a repository declares for ITSELF, in
 * the one place a repository declares one: `S.Factory({ issueTransitions })`
 * in its own `.smithers/FACTORY.ts`, projected by its own
 * `//:factoryProjection` target into `.smithers/factory.json`, which is the
 * file the server reads at the repository's default bookmark
 * (`services/issue_transitions.go` `readRepositoryIssueTransitions`). The
 * labels come from that declaration and never from the request, so a
 * scenario cannot choose the move: it can only choose a declared id.
 *
 * This module is therefore the fixture's SOURCE, not a copy of the product's
 * behaviour. `ISSUE_POLICY_FACTORY_SOURCE` is the declaration a fixture
 * repository carries and `ISSUE_POLICY_PROJECTION` is what the repository's
 * own generator renders from it, byte for byte:
 *
 * ```
 * bun -e 'import * as F from "@smthrs/targets/Factory"; import { factory } from "./.smithers/FACTORY.ts"; process.stdout.write(F.renderProjection(factory, []))'
 * ```
 *
 * The ids and labels are namespaced to this fixture, so a repository that
 * carries it collides with nothing it already declares, and the scenario
 * reads the committed projection back through the product's own contents
 * door before it moves anything: the policy it drives is the repository's,
 * not this file's.
 */

/** One transition as the fixture declares it, in declaration order. */
export const ISSUE_POLICY_TRANSITIONS: ReadonlyArray<FactoryIssueTransition> = [
  { id: "e2e-propose", title: "Propose it", to: "smithers-e2e-proposed", actor: "person" },
  { id: "e2e-accept", title: "Accept the proposal", from: "smithers-e2e-proposed", to: "smithers-e2e-accepted", actor: "person" }
]

/** The declared move the workflow exists for: proposed to accepted. */
export const ISSUE_POLICY_PROPOSE = ISSUE_POLICY_TRANSITIONS[0]!
export const ISSUE_POLICY_ACCEPT = ISSUE_POLICY_TRANSITIONS[1]!

/**
 * A well-formed transition id this fixture deliberately declares NOWHERE.
 * An undeclared move is refused on the repository's own declaration, before
 * any request leaves for GitHub, so the issue is untouched by the refusal.
 */
export const ISSUE_POLICY_UNDECLARED = "e2e-undeclared"

/** The `.smithers/FACTORY.ts` a fixture repository carries. */
export const ISSUE_POLICY_FACTORY_SOURCE = `import { Smithers as S } from "@smthrs/targets"

export const factory = S.Factory({
  summary: "How this fixture repository moves its own issues.",
  flows: [],
  on: {},
  github: S.Github.Policy({ mirror: "pull", issues: "two-way", changes: "send-upstream" }),
  issueTransitions: [
    { id: "e2e-propose", title: "Propose it", to: "smithers-e2e-proposed", actor: "person" },
    { id: "e2e-accept", title: "Accept the proposal", from: "smithers-e2e-proposed", to: "smithers-e2e-accepted", actor: "person" }
  ]
})
`

/** The `.smithers/factory.json` that declaration's own generator renders. */
export const ISSUE_POLICY_PROJECTION = `{
  "summary": "How this fixture repository moves its own issues.",
  "flows": [],
  "on": [],
  "github": {
    "mirror": "pull",
    "issues": "two-way",
    "changes": "send-upstream"
  },
  "issueTransitions": [
    {
      "id": "e2e-propose",
      "title": "Propose it",
      "to": "smithers-e2e-proposed",
      "actor": "person"
    },
    {
      "id": "e2e-accept",
      "title": "Accept the proposal",
      "from": "smithers-e2e-proposed",
      "to": "smithers-e2e-accepted",
      "actor": "person"
    }
  ]
}
`

/** The two files a fixture repository carries, by repository-relative path. */
export const issuePolicyFiles = (): Readonly<Record<string, string>> => ({
  ".smithers/FACTORY.ts": ISSUE_POLICY_FACTORY_SOURCE,
  [FACTORY_PROJECTION_PATH]: ISSUE_POLICY_PROJECTION
})

/** Every label the fixture's declaration moves; nothing else is touched. */
export const issuePolicyLabels = (): ReadonlyArray<string> =>
  [...new Set(ISSUE_POLICY_TRANSITIONS.flatMap((transition) => [transition.to, ...(transition.from ? [transition.from] : [])]))]

/**
 * The repository that CARRIES the fixture declaration on its default
 * bookmark. It is named by the run, never by this file: the declaration is a
 * repository's own, so which repository declares it is the operator's
 * choice, and a scenario that invented one would drive a policy nobody
 * committed.
 */
export const issuePolicyRepository = (): string => {
  const named = process.env.SMITHERS_REAL_ISSUE_POLICY_REPO?.trim()
  if (!named) {
    throw new Error(
      "SMITHERS_REAL_ISSUE_POLICY_REPO must name the owner/name repository whose default bookmark carries " +
      `${FACTORY_PROJECTION_PATH} with this fixture's issueTransitions (e2e/real/support/issue-policy-fixture.ts).`
    )
  }
  const [owner, name, extra] = named.split("/")
  if (!owner || !name || extra !== undefined) throw new Error(`SMITHERS_REAL_ISSUE_POLICY_REPO must be owner/name: ${named}`)
  return named
}

/**
 * The declaration the repository has COMMITTED, read through the product's
 * own contents door — the same file and the same route the server reads the
 * policy from. A scenario asserts this before it moves anything, so a run
 * against a repository carrying a different declaration fails on the
 * declaration rather than on the move.
 */
export const readCommittedIssuePolicy = async (page: Page, request: APIRequestContext, repo: string): Promise<string> => {
  const response = await realApi(page, request, "GET", repositoryApiPath(repo, `/contents/${FACTORY_PROJECTION_PATH}`))
  expect(response.status(), `${repo} must commit ${FACTORY_PROJECTION_PATH} on its default bookmark`).toBe(200)
  const body = await response.json() as { readonly content?: unknown; readonly encoding?: unknown }
  expect(typeof body.content).toBe("string")
  return body.encoding === "base64" ? Buffer.from(body.content as string, "base64").toString("utf8") : body.content as string
}

/**
 * The transitions the repository declares, as the product's own list door
 * answers them (`GET /api/repos/{owner}/{repo}/issue-transitions`). Listing
 * one is not permission to run it; who may run it is decided again on the
 * write, and once more on the worker's fence.
 */
export const readDeclaredTransitions = async (
  page: Page,
  request: APIRequestContext,
  repo: string
): Promise<ReadonlyArray<FactoryIssueTransition>> => {
  const response = await realApi(page, request, "GET", repositoryApiPath(repo, "/issue-transitions"))
  expect(response.status(), `GET issue-transitions for ${repo}`).toBe(200)
  const body = await response.json() as unknown
  expect(Array.isArray(body)).toBe(true)
  return (body as ReadonlyArray<unknown>).map((row) => FactoryIssueTransitionSchema.parse(row))
}

/** Every declared transition the committed projection carries, decoded as the app decodes it. */
export const committedTransitions = (projection: string): ReadonlyArray<FactoryIssueTransition> =>
  FactoryProjectionSchema.parse(JSON.parse(projection)).issueTransitions ?? []

/** Whether the declaration says a PERSON has to make the move `id` names. */
export const declaredNeedsPerson = (projection: string, id: string): boolean => {
  const transition = issueTransitionOf(FactoryProjectionSchema.parse(JSON.parse(projection)), id)
  if (transition === undefined) throw new Error(`The committed declaration has no transition ${id}`)
  return issueTransitionNeedsPerson(transition)
}

/**
 * GitHub's own answer about one issue of `repo`, through the product's
 * GitHub-source read — the same GET-only route the issue card reads, so the
 * labels a transition applied are read back from GitHub and not from the
 * client that asked for the move.
 */
export const readGitHubIssue = async (
  page: Page,
  request: APIRequestContext,
  repo: string,
  number: number
): Promise<{ readonly labels: ReadonlyArray<string>; readonly comments: number }> => {
  const [owner = "", name = ""] = repo.split("/")
  const response = await realApi(page, request, "GET",
    `/api/user/github-repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?state=all&per_page=100`)
  expect(response.status(), `GET GitHub issues for ${repo}`).toBe(200)
  const rows = await response.json() as ReadonlyArray<{
    readonly number?: unknown
    readonly labels?: ReadonlyArray<{ readonly name?: unknown } | string>
    readonly comments?: unknown
  }>
  expect(Array.isArray(rows)).toBe(true)
  const issue = rows.find((row) => row.number === number)
  if (issue === undefined) throw new Error(`GitHub issue #${number} is not in ${repo}'s source list`)
  return {
    labels: (issue.labels ?? []).map((label) => typeof label === "string" ? label : String(label.name)),
    comments: typeof issue.comments === "number" ? issue.comments : 0
  }
}

/** The transition door's own path, so a scenario can observe exactly which request left. */
export const transitionPath = (repo: string, number: number, id: string): string => {
  const [owner = "", name = ""] = repo.split("/")
  return `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/github/issues/${number}/transitions/${encodeURIComponent(id)}`
}

/**
 * One GitHub issue of `repo`, opened through the product's own create door
 * and resolved to the number GitHub actually gave it. The acknowledgment is
 * an ADMISSION, so the number is read from the request's own status door
 * rather than assumed from the answer.
 */
export const openGitHubIssue = async (
  page: Page,
  request: APIRequestContext,
  repo: string,
  title: string,
  run: (line: string) => Promise<void>
): Promise<number> => {
  const created = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === repositoryApiPath(repo, "/github/issues"))
  await run(`/issues.create ${title} ${repo} --source github`)
  const response = await created
  expect(response.status(), `open a GitHub issue in ${repo}`).toBe(202)
  const receipt = await response.json() as { readonly requestId?: unknown }
  expect(typeof receipt.requestId).toBe("string")
  let number: number | undefined
  await expect.poll(async () => {
    const status = await realApi(page, request, "GET", repositoryApiPath(repo, `/github/issues/requests/${encodeURIComponent(receipt.requestId as string)}`))
    if (status.status() !== 200) return `http-${status.status()}`
    const body = await status.json() as { readonly state?: unknown; readonly number?: unknown }
    if (typeof body.number === "number") number = body.number
    return String(body.state)
  }, { timeout: 300_000, intervals: [1_000, 2_000, 3_000] }).toBe("completed")
  if (number === undefined) throw new Error(`The create request for ${repo} completed without an issue number`)
  return number
}

/**
 * One declared transition, run by the signed-in PERSON through the door they
 * type, with the one request that left observed: its path names the typed
 * repository and the declared id, it carries an idempotency key, and it
 * carries no body — the labels are the repository's declaration's, so a
 * request can name neither them nor an actor.
 */
export const runDeclaredTransition = async (
  page: Page,
  repo: string,
  number: number,
  id: string,
  run: (line: string) => Promise<void>
): Promise<{ readonly status: number; readonly key: string | null; readonly body: string | null }> => {
  const path = transitionPath(repo, number, id)
  const answered = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === path)
  await run(`/issues.transition ${number} ${id} ${repo}`)
  const response = await answered
  const sent = response.request()
  return { status: response.status(), key: await sent.headerValue("idempotency-key"), body: sent.postData() }
}
