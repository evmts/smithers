/*
 * The showcase: one small file per case under ./cases, each a real walk of
 * the app on the T1 browser host (e2e/playwright/webserver.ts) with the same
 * fake-backend fixtures the T1 specs use. showcase.spec.ts runs every case as
 * an assertion test; with SHOWCASE_RECORD=<dir> it also records the walk and
 * writes its metadata for scripts/showcase.ts, which makes the GIFs and page.
 *
 * A case names the flows it demonstrates. The harness watches the page for
 * the flows actually invoked (button data-flow, slash lines, Cmd+K, chat
 * sends) and fails the case when a named flow never ran, so the page cannot
 * claim a flow the recording does not show.
 */
import { type Locator, type Page, type Route } from "@playwright/test"
import type { FlowName } from "../../src/mainview/flows/FlowName"
import { installCloudFixture } from "../playwright/cloudFixture"

type CloudOptions = NonNullable<Parameters<typeof installCloudFixture>[1]>

/** What a case drives: the app (with pacing that only applies while recording). */
export interface ShowcaseApp {
  /** Navigate and wait for the booted shell; the recording starts here. */
  readonly open: (path?: string) => Promise<void>
  /** Open Chat if needed, type a slash line, send it. */
  readonly slash: (line: string) => Promise<void>
  /** Open Chat if needed, type a prompt, send it. */
  readonly say: (text: string) => Promise<void>
  /** Close the composer if it is open. */
  readonly closeComposer: () => Promise<void>
  /** Press a chord; while recording, the chord is shown on screen. */
  readonly press: (keys: string) => Promise<void>
  /** Click, moving a visible cursor there first while recording. */
  readonly click: (target: Locator) => Promise<void>
  /** Type into a field, one key at a time while recording. */
  readonly type: (target: Locator, text: string) => Promise<void>
  /** Scroll an element into the middle of the view. */
  readonly show: (target: Locator) => Promise<void>
  /** Maximize an embedded card through its own button (card.maximize). */
  readonly maximize: (card: Locator) => Promise<void>
  /** A pause for the viewer; no-op when only asserting. */
  readonly beat: (ms?: number) => Promise<void>
  /**
   * Credit a flow whose control calls it without a visible door (no data-flow,
   * slash line or chord). The proof must observe the flow's effect, e.g. the
   * request it sent; the flow counts only once the proof passes.
   */
  readonly saw: (flow: ShowcaseFlow, proof: () => Promise<unknown>) => Promise<void>
  /**
   * A still for the docs: the page (or one element) as `<SHOWCASE_STILLS>/<name>.png`, at the
   * context's scale (`SHOWCASE_SCALE=2` for the site's 2x captures). No-op without SHOWCASE_STILLS.
   */
  readonly still: (name: string, target?: Locator) => Promise<void>
  readonly recording: boolean
}

/** The fake backend: the T1 fixtures (e2e/playwright/cloudFixture.ts, identity.ts) and plain routes. */
export interface ShowcaseBackend {
  /** The signed-in Smithers Cloud double (e2e/playwright/cloudFixture.ts). */
  readonly cloud: (options?: CloudOptions) => Promise<void>
  /** A signed-out cloud visitor (e2e/playwright/identity.ts). */
  readonly signedOut: () => Promise<void>
  /** Answer one exact pathname with JSON; later routes override earlier ones. */
  readonly json: (pathname: string, body: unknown | (() => unknown), status?: number) => Promise<void>
  readonly route: (match: (url: URL) => boolean, handler: (route: Route) => Promise<void> | void) => Promise<void>
}

export interface ShowcaseContext {
  readonly page: Page
  readonly app: ShowcaseApp
  readonly backend: ShowcaseBackend
}

/** A declared flow. The `search.*` flows are declared through a helper, so FlowName does not list them; scripts/showcase.test.ts checks every name against the live registry. */
export type ShowcaseFlow = FlowName | `search.${string}`

export interface ShowcaseCase {
  /** Lowercase words joined by dashes; also the GIF's file name. */
  readonly id: string
  /** Where the case sits in a new user's walk through the product. */
  readonly order: number
  readonly title: string
  /** One line. */
  readonly summary: string
  /** Every flow the recording demonstrates; each must actually run. */
  readonly flows: ReadonlyArray<ShowcaseFlow>
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly run: (context: ShowcaseContext) => Promise<void>
}

/** Declare a case. Pure: registering it as a test is showcase.spec.ts's job. */
export const showcase = (definition: ShowcaseCase): ShowcaseCase => definition

/** What a recorded run leaves beside its video for the page. */
export interface ShowcaseRecord {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly summary: string
  readonly flows: ReadonlyArray<string>
  /** The gestures that ran, in order: slash lines, chords and button labels. */
  readonly doors: ReadonlyArray<string>
  /** Every flow the page saw invoked. */
  readonly observed: ReadonlyArray<string>
  /** Every flow registered on the shell during the run (the data-flows manifest). */
  readonly registered: ReadonlyArray<string>
  /** Always true today: every case runs on the T1 test host (fixture routes, stub chat model). */
  readonly fakeBackend: boolean
  /** The commit the case was recorded at; absent in records made before it was kept. */
  readonly revision?: string
  /** Seconds of boot to cut from the start of the video. */
  readonly trimStart: number
  readonly recordedAt: string
}

export { DEFAULT_VIEWPORT, prepare, type ShowcaseRun } from "./driver"
