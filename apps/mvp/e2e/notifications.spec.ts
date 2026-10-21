import { createHmac, randomBytes } from "node:crypto"
import { expect, type Tab, test } from "./devices"

// Notifications and live work, end to end (decision 0009, docs/features/notifications.md): two people, Ann on two
// devices and Ben on one, in real browsers against the real app, ChatApi, Postgres and Electric. Ann's agent is the
// scripted one in her first device's engine worker (`/app?agent=needs-you`, src/test/scriptedAgent.ts), so its run
// asks her a question every time; everything else is real. Ben is local development's second person
// (`smithers_dev_person=teammate`, worker/DevChatApi.ts); both open the home conversation, so both are on `main`.

const PROMPT = "Which branch should I deploy?"

/**
 * How long another device takes to show a change. Under the dev server's HTTP/1.1 a tab's live shapes share six
 * connections, more than six hold a long poll each, and a change waits for one to come back: up to about 20 s, twice.
 */
const SYNCED_WITHIN = 90_000

/** The stack on `tab`: the inline one over the home conversation, or the floating one on any other page. */
const stack = (tab: Tab) => tab.page.getByRole("region", { name: "Smithers" })

/** The toast or list entry about `subject` on `tab`. */
const entry = (tab: Tab, subject: string) => stack(tab).locator(`[data-slot="toast"][data-subject="${subject}"]`)

/** `+N`, which opens the person's list in place. */
const more = (tab: Tab) => stack(tab).getByRole("button", { name: /^\+\d+$/ })

/**
 * Checks `check` on `tab` with the person's list open, opening it first whenever it is closed: under the dev server,
 * another change to the app's sources reloads the page, and a reloaded stack starts closed.
 */
const inList = (tab: Tab, check: () => Promise<void>, timeout = SYNCED_WITHIN) =>
  expect(async () => {
    if (await more(tab).isVisible()) await more(tab).click()
    await check()
  }).toPass({ timeout, intervals: [250, 500, 1_000] })

test("live work: Ann's run toasts for Ben on her branch, and her feed follows her across devices", async ({ devices }) => {
  test.setTimeout(480_000)
  const word = devices.word
  const [a1, a2] = await devices.open("Ann", "Ann 2")
  const [b] = await devices.openTeammate("Ben")
  // Ben leaves the conversation for the Runs page: Ann's work on `main` reaches him there.
  await b.page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Runs" }).click()
  await expect(b.page.getByRole("main", { name: "Runs" })).toBeVisible()
  await a1.page.goto("/app?agent=needs-you")
  await a1.ready()

  const question = `Deploy the docs preview, ${word}`
  await a1.askAndWaitTaken(question)
  const answerId = a1.asked.find((asked) => asked.text === question)!.answerId
  const subject = `run:${answerId}`

  // Ann's agent asks her: a gold toast with Answer on both her devices.
  for (const tab of [a1, a2]) {
    await expect(entry(tab, subject), `${tab.name}: Ann's question toasts`).toContainText(`Needs you · ${PROMPT}`, {
      timeout: 120_000,
    })
    await expect(entry(tab, subject).getByRole("button", { name: "Answer" })).toBeVisible()
  }
  // Ben, on another page, sees her run waiting, named, in the floating stack, with no Answer of his own.
  await expect(stack(b)).toHaveAttribute("data-placement", "fixed")
  await expect(entry(b, subject), "Ben: Ann's run on his branch toasts").toContainText("Waiting · local-developer", {
    timeout: SYNCED_WITHIN,
  })
  await expect(entry(b, subject)).toContainText(word)
  await expect(entry(b, subject).getByRole("button", { name: "Answer" })).toHaveCount(0)

  // Hide on Ann's second device hides the toast on both; the entry stays in her list.
  await entry(a2, subject).getByRole("button", { name: "Hide" }).click()
  for (const tab of [a1, a2]) await expect(entry(tab, subject), `${tab.name}: hidden`).toHaveCount(0, { timeout: SYNCED_WITHIN })
  // She answers from her list: the question's card takes focus.
  const field = a1.page.locator(`[data-slot="needs-you"][data-run="${answerId}"]`).getByRole("textbox", { name: "Your answer" })
  await inList(a1, async () => {
    await expect(entry(a1, subject), "Ann: still in her list").toContainText(`Needs you · ${PROMPT}`, { timeout: 2_000 })
    await entry(a1, subject).getByRole("button", { name: "Answer" }).click({ timeout: 2_000 })
    await expect(field).toBeFocused({ timeout: 2_000 })
  })
  await field.fill("docs-v2")
  await field.press("Enter")
  await a1.expectAnswered(question, "Deploying docs-v2.", 120_000)

  // Done: Ben's toast settles and goes by itself (4 s after the run finished; the rule is src/features/attention's
  // tests'); it never joins his list.
  await expect(entry(b, subject), "Ben: it goes once the run is done").toHaveCount(0, { timeout: SYNCED_WITHIN })
  await inList(b, () => expect(entry(b, subject), "Ben: never in his list").toHaveCount(0, { timeout: 2_000 }))

  // Ann: it shows in her conversation, not as a toast; her list has it unread on both devices.
  for (const tab of [a1, a2]) {
    await inList(tab, async () => {
      await expect(entry(tab, subject), `${tab.name}: done, unread`).toContainText("Done", { timeout: 2_000 })
      await expect(entry(tab, subject)).toHaveAttribute("data-unread", "", { timeout: 2_000 })
    })
  }
  // Opening it on her second device reads it on both.
  await inList(a2, () => entry(a2, subject).getByRole("button", { name: "Open" }).click({ timeout: 2_000 }))
  for (const tab of [a1, a2]) {
    await inList(tab, () => expect(entry(tab, subject), `${tab.name}: read`).not.toHaveAttribute("data-unread", "", { timeout: 2_000 }))
  }
  // Dismiss on her first device closes it on both.
  await inList(a1, () => entry(a1, subject).getByRole("button", { name: "Dismiss" }).click({ timeout: 2_000 }))
  for (const tab of [a1, a2]) {
    await expect(entry(tab, subject), `${tab.name}: dismissed`).toHaveCount(0, { timeout: SYNCED_WITHIN })
  }
})

// GitHub's deliveries need the deployment's webhook secret, which only a deployment with the GitHub App configured
// has: this test signs them as GitHub does. It writes a `main` entry for everyone watching the repository, so it runs
// only against local development.
const secret = process.env.E2E_GITHUB_WEBHOOK_SECRET
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.BASE_URL ?? "http://localhost:1337")

test("repository events: `main` moving and a new release reach both people as entries", async ({ devices }) => {
  test.skip(secret === undefined || !local, "needs E2E_GITHUB_WEBHOOK_SECRET, the dev server's GITHUB_WEBHOOK_SECRET with the GitHub App configured")
  test.setTimeout(180_000)
  const repository = process.env.GITHUB_REPOSITORY ?? "smithersai/smithers"
  const [a] = await devices.open("Ann")
  const [b] = await devices.openTeammate("Ben")
  const sha = randomBytes(20).toString("hex")
  const tag = `v0.0.0-${devices.word}`
  const deliver = async (event: string, payload: unknown) => {
    const body = JSON.stringify(payload)
    const response = await a.page.request.post("/api/github/webhook", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-github-delivery": crypto.randomUUID(),
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret!).update(body).digest("hex")}`,
      },
    })
    expect(response.status(), `GitHub's ${event} delivery is taken`).toBe(200)
  }
  await deliver("push", {
    ref: "refs/heads/main",
    after: sha,
    repository: { full_name: repository, default_branch: "main", pushed_at: Math.floor(Date.now() / 1000) },
    head_commit: { message: `Ship ${devices.word}` },
    pusher: { name: "dana" },
  })
  await deliver("release", {
    action: "published",
    release: { tag_name: tag, name: `Release ${devices.word}`, published_at: new Date().toISOString() },
    repository: { full_name: repository },
  })
  const [owner, name] = repository.toLowerCase().split("/")
  for (const tab of [a, b]) {
    await inList(tab, async () => {
      await expect(entry(tab, `main:github/${owner}/${name}`)).toContainText(`main · ${sha.slice(0, 7)} Ship ${devices.word}`, {
        timeout: 2_000,
      })
      await expect(entry(tab, `release:github/${owner}/${name}:${tag}`)).toContainText(`Release · Release ${devices.word}`, {
        timeout: 2_000,
      })
    })
  }
  // Opening main takes Ben to the repository.
  await inList(b, () => entry(b, `main:github/${owner}/${name}`).getByRole("button", { name: "Open" }).click({ timeout: 2_000 }))
  await expect(b.page).toHaveURL(new RegExp(`/${owner}/${name}$`, "i"))
})
