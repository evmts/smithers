import { test as base, type BrowserContextOptions } from "@playwright/test"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { DEV_URL } from "../dev/https"
import { type Role, ROLES } from "../src/features/auth/contract"

// What the e2e tests run against, and what each test needs from it (docs/rules.md, test.e2e-declared-needs). One suite
// runs locally against `alchemy dev` and against a deployment (docs/rulings.md TEST-4). A test that needs something a
// target lacks says so with `requires`: it skips there with that need's reason, and the run's summary
// (e2e/summary.ts) lists it. A test known to fail on a target is marked with `broken` (TEST-5). Nothing else may skip.

export type Target = "local" | "deployment"

/** Whether `url` is a dev server on this machine, whose certificate may be self-signed (dev/https.ts). */
export const onThisMachine = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)

/** `BASE_URL` when it is an http(s) URL; anything else, such as the "/" Vite gives vitest, names no app. */
export const appURLOf = (env: { readonly BASE_URL?: string | undefined }) =>
  env.BASE_URL !== undefined && /^https?:\/\//.test(env.BASE_URL) ? env.BASE_URL : undefined

/**
 * The target `env` names: `E2E_TARGET` when set, else a deployment when `BASE_URL` points off this machine. A local
 * stack that signs in through GitHub, as a deployment does, runs as one with `E2E_TARGET=deployment`.
 */
export const targetOf = (env: { readonly E2E_TARGET?: string | undefined; readonly BASE_URL?: string | undefined }): Target => {
  const named = env.E2E_TARGET ?? ""
  if (named === "local" || named === "deployment") return named
  if (named !== "") throw new Error(`E2E_TARGET is "${named}": it must be local or deployment`)
  const url = appURLOf(env)
  return url === undefined || onThisMachine(url) ? "local" : "deployment"
}

/** The app the tests open: `BASE_URL`, or the local dev server. */
export const baseURL = appURLOf(process.env) ?? DEV_URL

export const target: Target = targetOf(process.env)

/** Who a run is signed in as: the deployment's test account, or local development's Admin (worker/DevChatApi.ts). */
export type Identity = { readonly origin: string; readonly login: string; readonly personId: string; readonly role: Role | null }

/** Local development's person, signed in until a test signs them out. */
export const LOCAL_DEVELOPER: Identity = { origin: new URL(baseURL).origin, login: "local-developer", personId: "local-developer", role: "admin" }

/**
 * Where a deployment's stored session lives: one folder per host, outside the repository so every workspace shares one
 * session and no copy of the checkout carries it. `E2E_SESSION_DIR` moves the root.
 */
export const sessionFiles = (url: string, env: { readonly E2E_SESSION_DIR?: string | undefined } = process.env) => {
  const dir = join(env.E2E_SESSION_DIR ?? join(homedir(), ".smithers-e2e"), new URL(url).host.replace(/[^a-z0-9.-]/gi, "_"))
  return { dir, session: join(dir, "session.json"), identity: join(dir, "identity.json") }
}

/** Reads an identity file the setup wrote (e2e/deployment/sign-in.setup.ts); undefined when there is none yet. */
export const readIdentity = (path: string): Identity | undefined => {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return undefined
  }
  const value = JSON.parse(text) as Partial<Identity>
  const role = value.role ?? null
  if (typeof value.login !== "string" || typeof value.personId !== "string" || typeof value.origin !== "string" || (role !== null && !ROLES.includes(role))) {
    throw new Error(`${path} is not an identity the e2e setup wrote; delete it and run the setup again`)
  }
  return { origin: value.origin, login: value.login, personId: value.personId, role }
}

/** The person this run is signed in as. In a deployment, the setup project must have run. */
export const me = (): Identity => {
  if (target === "local") return LOCAL_DEVELOPER
  const path = sessionFiles(baseURL).identity
  const identity = readIdentity(path)
  if (identity === undefined) throw new Error(`No ${path}: run the deployment's setup project first (pnpm e2e:prod)`)
  return identity
}

/** A browser context with no session: in a deployment project every context starts from the stored session otherwise. */
export const signedOut: Pick<BrowserContextOptions, "storageState"> = { storageState: { cookies: [], origins: [] } }

const MEMBER_OR_ABOVE: ReadonlySet<Role | null> = new Set<Role | null>(["admin", "maintainer", "member"])
const MAINTAINER_OR_ABOVE: ReadonlySet<Role | null> = new Set<Role | null>(["admin", "maintainer"])

/** What a run offers a test: its target and who it is signed in as (read only when a need asks). */
export type Run = { readonly target: Target; readonly role: () => Role | null }

/**
 * A need: when a run meets it, and why a test that has it skips otherwise. A `blocked` need is a prerequisite the run
 * lacks, such as the test account's role, not something the target can never offer: the summary fails the run for it.
 */
export type Need = { readonly met: (run: Run) => boolean; readonly reason: string; readonly blocked?: true }

const localOnly = (reason: string): Need => ({ met: (run) => run.target === "local", reason })

const needs = {
  faults: localOnly("the app's faulty services (`/app?faults`, e2e/faults.ts) are in dev builds only"),
  scriptedAgent: localOnly("the scripted model (`/app?agent=<script>`) is in dev builds only"),
  devPeople: localOnly("local development's second and third people (the smithers_dev_person cookie) exist only without GitHub sign-in; a deployment needs another real test account"),
  devSignIn: localOnly("it signs out and in as local development's person; in a deployment that would end the run's shared session"),
  localLogs: localOnly("it reads the Workers' logs from local .alchemy/log files; a deployment's are in Workers Logs"),
  localServer: localOnly("it serves fixtures or builds from this machine, which a deployment can't reach"),
  devConfig: localOnly("it starts the dev server with settings of its own (provider URLs or a webhook secret)"),
  githubSignIn: { met: (run) => run.target === "deployment", reason: "it signs in through GitHub; local development signs its person in without GitHub" },
  member: {
    met: (run) => MEMBER_OR_ABOVE.has(run.role()),
    reason: "it asks, clones or tracks, which needs a Member or above; the test account's role on the deployment's repository is below that",
    blocked: true,
  },
  maintainer: {
    met: (run) => MAINTAINER_OR_ABOVE.has(run.role()),
    reason: "it needs a Maintainer or above; the test account's role on the deployment's repository is below that",
    blocked: true,
  },
} satisfies Record<string, Need>

export type NeedName = keyof typeof needs

/** Every need a test may declare, with its reason. */
export const NEEDS: Readonly<Record<NeedName, Need>> = needs

/** Behavior known to fail on a target (TEST-5): each is fixed by deleting its entry, which turns its tests back on. */
export const KNOWN_BROKEN = {
  remoteFlows: {
    in: ["deployment"],
    reason: "every remote flow fails MigrationError in production (apps/mvp/docs/work/prod-e2e.md)",
  },
} satisfies Record<string, { readonly in: ReadonlyArray<Target>; readonly reason: string }>

export type BrokenName = keyof typeof KNOWN_BROKEN

/** A skip's or a broken mark's description: the need's name, then its reason. The summary reads the name back. */
export const describeNeed = (name: NeedName) => `${NEEDS[name].blocked ? "blocked" : "needs"} ${name}: ${NEEDS[name].reason}`
export const describeBroken = (name: BrokenName) => `broken ${name}: ${KNOWN_BROKEN[name].reason}`

/** The need or broken mark a description names, if any: `needs faults: …` is `faults`. */
export const parseDescription = (description: string | undefined): { kind: "needs" | "blocked" | "broken"; name: string } | undefined => {
  const match = /^(needs|blocked|broken) ([A-Za-z]+): /.exec(description ?? "")
  if (match === null) return undefined
  const [, kind, name] = match as unknown as [string, "needs" | "blocked" | "broken", string]
  const known = kind === "broken" ? name in KNOWN_BROKEN : name in NEEDS && (NEEDS[name as NeedName].blocked === true) === (kind === "blocked")
  return known ? { kind, name } : undefined
}

const thisRun: Run = { target, role: () => me().role }

/** Whether this run meets `name`. */
export const meets = (name: NeedName, run: Run = thisRun) => NEEDS[name].met(run)

const inTest = () => {
  try {
    base.info()
    return true
  } catch {
    return false
  }
}

/**
 * Declares what a test (called in its body) or every test of a file or describe block (called there) needs. Where the
 * run doesn't meet a need, the test skips with that need's reason; a deployment's role is read when the test starts.
 */
export const requires = (...names: ReadonlyArray<NeedName>) => {
  for (const name of names) {
    if (inTest()) base.skip(!meets(name), describeNeed(name))
    else base.skip(() => !meets(name), describeNeed(name))
  }
}

/** Marks a test (in its body) or a file or describe block as failing on the targets `name` breaks (TEST-5). */
export const broken = (name: BrokenName) => {
  const on = (KNOWN_BROKEN[name].in as ReadonlyArray<Target>).includes(target)
  if (inTest()) base.fail(on, describeBroken(name))
  else base.fail(() => on, describeBroken(name))
}

/**
 * Whether this test, in its body, may also check what `name` offers: where the run doesn't meet it, the test runs
 * without that part, and its `partly` annotation tells the summary which part it left out.
 */
export const partly = (name: NeedName) => {
  const met = meets(name)
  if (!met) base.info().annotations.push({ type: "partly", description: describeNeed(name) })
  return met
}

/** A test used something its target lacks without declaring it: fail at once, saying which `requires` is missing. */
export class UndeclaredNeed extends Error {
  constructor(readonly need: NeedName) {
    super(`This test needs ${need} (${NEEDS[need].reason}). Declare it with requires("${need}").`)
    this.name = "UndeclaredNeed"
  }
}

/** Called by a helper that only works where `name` is met, so a test that forgot `requires` fails fast and says why. */
export const guard = (name: NeedName, run: Run = thisRun) => {
  if (!NEEDS[name].met(run)) throw new UndeclaredNeed(name)
}
