import { createHmac, randomUUID } from "node:crypto"
import { expect, test } from "./devices"
import { field, type LogRecord, LogTail } from "./logs"
import { me, partly, requires } from "./target"

// Remote flows on the deployment (docs/features/remote-flows.md): the git loop's `github/Reconcile` and `github/Apply`,
// `ops/SpendAlert`, `chat/Expire` and `auth/RecheckRole`, each run by ChatApi's `FlowExecution` Durable Objects. Each
// test does what a person does, then waits for the flow's own record in ChatApi's records (e2e/logs.ts: a Cloudflare
// tail in a deployment) and for what the person sees. Records carry ids, counts and outcomes, never content.
//
// The repository is the deployment's GITHUB_REPOSITORY, the one it syncs (`E2E_SYNCED_REPOSITORY`, smithersai/smithers
// unless set). Nothing here writes to GitHub: the webhook test signs a delivery for an issue that exists, which the
// flow reads back. The spend alert, an answer's expiry and a role check wait out production's own windows, so they run
// with E2E_LONG=1. Signing out revokes the session's GitHub token (`auth/RevokeGitHubToken`); no test here signs out,
// which would end the run's shared session (docs/work/prod-e2e.md).

const REPOSITORY = process.env.E2E_SYNCED_REPOSITORY ?? "smithersai/smithers"

/** ChatApi's own records named `message`, in arrival order. */
const named = async (logs: LogTail, message: string): Promise<Array<LogRecord>> =>
  (await logs.records()).own.filter((record) => record.message === message)

/** The outcomes of the records named `message` that match `where`. */
const outcomes = async (logs: LogTail, message: string, where: (record: LogRecord) => boolean = () => true) =>
  (await named(logs, message)).filter(where).map((record) => field(record, "outcome"))

/** The issue links of the issues list, `/<owner>/<name>/issues/<number>`. */
const issueLinks = (page: import("@playwright/test").Page) =>
  page.locator(`main[aria-label="Issues"] a[href^="/${REPOSITORY}/issues/"]:not([href$="/new"])`)

test("issues sync: a Member's issues list fills from GitHub, and a stale read starts github/Reconcile", {
  annotation: { type: "summary", description: "The synced repository's issues list fills from GitHub through the remote sync." },
}, async ({ devices }) => {
  requires("githubApp", "member")
  test.setTimeout(12 * 60_000)
  const logs = partly("localLogs") ? await LogTail.start() : undefined
  try {
    const [a] = await devices.open("A")
    await a.page.goto(`/${REPOSITORY}/issues`)
    // The first walk of a large repository reads up to 50 pages before it stops `partial`; the list fills as it goes.
    await expect(issueLinks(a.page).first()).toBeVisible({ timeout: 10 * 60_000 })
    if (logs !== undefined) {
      // A walk this read started, or a fresh sync that started none: never a failed one.
      const walks = await outcomes(logs, "github.reconcile")
      expect(walks.filter((outcome) => !["complete", "partial", "superseded"].includes(String(outcome)))).toEqual([])
    }
  } finally {
    await logs?.dispose()
  }
})

test("webhook: a signed issues delivery starts github/Apply, which reads the issue back from GitHub", {
  annotation: { type: "summary", description: "A GitHub delivery for an issue re-reads it into the app." },
}, async ({ devices, request }) => {
  requires("githubApp", "member", "webhookSecret", "localLogs")
  test.setTimeout(5 * 60_000)
  const logs = await LogTail.start()
  try {
    const [a] = await devices.open("A")
    await a.page.goto(`/${REPOSITORY}/issues`)
    const href = await issueLinks(a.page).first().getAttribute("href", { timeout: 10 * 60_000 })
    const number = Number(href!.slice(href!.lastIndexOf("/") + 1))
    const deliveryId = randomUUID()
    const body = JSON.stringify({ action: "edited", issue: { number }, repository: { full_name: REPOSITORY } })
    const signature = createHmac("sha256", process.env.E2E_GITHUB_WEBHOOK_SECRET!).update(body).digest("hex")
    const delivered = await request.post("/api/github/webhook", {
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-github-delivery": deliveryId,
        "x-hub-signature-256": `sha256=${signature}`,
      },
      data: body,
    })
    expect(delivered.status()).toBe(200)
    const forDelivery = (record: LogRecord) => field(record, "deliveryId") === deliveryId
    await expect.poll(() => outcomes(logs, "github.webhook", forDelivery), { timeout: 60_000 }).toEqual(["applied"])
    await expect.poll(() => outcomes(logs, "github.apply", forDelivery), { timeout: 3 * 60_000, intervals: [2_000] })
      .toEqual([expect.stringMatching(/^(applied|unchanged)$/)])
  } finally {
    await logs.dispose()
  }
})

test("spend alert: a Member's question spends, and the window's ops/SpendAlert records the alert when it ends", {
  annotation: { type: "summary", description: "Model spend records one alert per window, for Admins." },
}, async ({ devices }) => {
  requires("member", "localLogs", "longRun")
  test.setTimeout(25 * 60_000)
  const logs = await LogTail.start()
  try {
    const [a] = await devices.open("A")
    const question = `Reply with the word spend-${devices.word}.`
    await a.askAndWaitTaken(question)
    await a.expectAnswered(question, `spend-${devices.word}`, 120_000)
    // The alert's flow waits out its window (15 minutes in production), then records it: an Admin's toast, and
    // email or Telegram when an Admin saved a destination.
    await expect.poll(() => outcomes(logs, "model.spend.alert"), { timeout: 20 * 60_000, intervals: [10_000] })
      .toContain("recorded")
  } finally {
    await logs.dispose()
  }
})

test("answer expiry: an answer whose device left settles Couldn't answer once chat/Expire's wait ends", {
  annotation: { type: "summary", description: "An answer abandoned by its device settles as failed on every device." },
}, async ({ devices }) => {
  requires("member", "localLogs", "longRun")
  test.setTimeout(35 * 60_000)
  const logs = await LogTail.start()
  try {
    const [a] = await devices.open("A")
    const question = `Count slowly to one hundred, then write expire-${devices.word}.`
    await a.askAndWaitTaken(question)
    // The device that answers it goes away before it answers.
    await a.close()
    // `chat/Expire` waits ANSWER_EXPIRY (25 minutes) of a still queue, then settles the answer.
    await expect.poll(() => outcomes(logs, "chat.answer.expire"), { timeout: 30 * 60_000, intervals: [15_000] })
      .toContain("abandoned")
    const [b] = await devices.open("B")
    await b.expectFailed(question, 120_000)
  } finally {
    await logs.dispose()
  }
})

test("role check: a session whose role is an hour old is checked again on its next request", {
  annotation: { type: "summary", description: "A signed-in person's role is re-read from GitHub every hour." },
}, async ({ devices }) => {
  requires("githubApp", "member", "localLogs", "longRun")
  // The session's role was read when it signed in; ROLE_RECHECK_MINUTES (60) after that, its next request checks it.
  test.setTimeout(70 * 60_000)
  const logs = await LogTail.start()
  try {
    const [a] = await devices.open("A")
    // A request a minute, as a person reading the page makes, until one starts the check and it has asked GitHub.
    await expect.poll(async () => {
      await a.page.goto(`/${REPOSITORY}/issues`)
      return outcomes(logs, "auth.role_check", (record) => field(record, "step") === "check")
    }, { timeout: 66 * 60_000, intervals: [60_000] }).toContain("checked")
    // The account's role on GitHub didn't change, so neither did the session's.
    expect(await (await a.page.request.get("/api/auth/session")).json()).toMatchObject({ signedIn: true, role: me().role })
  } finally {
    await logs.dispose()
  }
})
