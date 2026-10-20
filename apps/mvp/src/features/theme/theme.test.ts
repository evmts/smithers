// The theme (docs/features/flows.md#the-theme): its store and follower in Node over TanStack DB with persistence in
// memory, the engine worker's `Preferences` over a tab port that answers or fails, and the button's toggle through
// dispatch on the Node host's engine over the compose Postgres (`pnpm db:up`).
import { Persistence } from "@smthrs/effect-tanstack-db"
import { Action } from "@smthrs/flow"
import { Cause, Context, Effect, Exit, Layer, Scope } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { build } from "../../../worker/test/flowHost.ts"
import { ClientEngine, FlowDispatch } from "../../flows/dispatch"
import { TabCallFailed, TabPort } from "../../flows/tabPort"
import type { ThemeMode } from "./contract"
import { Preferences, PreferencesUnavailable, registration, SetTheme, workerPreferences } from "./flows"
import { tabHandlers, tabPreferences, ThemeStore } from "./store"
import { Theme } from "./theme"

const disposables: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposables.splice(0).reverse()) await dispose()
})

/** A tab's theme store in Node, on a host that records what it painted and mirrored. */
const openStore = async (system: ThemeMode = "light", paintedAtBoot?: ThemeMode) => {
  const painted: Array<ThemeMode> = []
  const mirrored: Array<ThemeMode> = []
  const scope = Effect.runSync(Scope.make())
  disposables.push(() => Effect.runPromise(Scope.close(scope, Exit.void)))
  const context = await Effect.runPromise(
    Scope.provide(scope)(
      Layer.build(
        ThemeStore.layer({
          paint: (m) => void painted.push(m),
          mirror: (m) => void mirrored.push(m),
          system: () => system,
          // What index.html painted from the mirror before the store opened, then each paint since.
          painted: () => painted.at(-1) ?? paintedAtBoot,
        })
          .pipe(Layer.provide(Persistence.memory)),
      ),
    ),
  )
  const run = <A, E>(effect: Effect.Effect<A, E, ThemeStore>) => Effect.runPromise(Effect.provide(effect, context))
  return { run, store: Context.get(context, ThemeStore), painted, mirrored }
}

const until = (check: () => boolean) => vi.waitFor(() => expect(check()).toBe(true), { timeout: 2_000, interval: 10 })

describe("ThemeStore", () => {
  test("shows the system's mode until a preference is written, then paints and mirrors each write", async () => {
    const { store, painted, mirrored } = await openStore("dark")

    const before = await Effect.runPromise(store.current)
    await Effect.runPromise(store.write("light"))
    await until(() => painted.at(-1) === "light")
    await Effect.runPromise(store.write("dark"))
    await until(() => painted.at(-1) === "dark")

    expect(before).toBe("dark")
    expect(store.shown()).toBe("dark")
    expect(await Effect.runPromise(store.current)).toBe("dark")
    expect(painted).toEqual(["light", "dark"])
    expect(mirrored).toEqual(["light", "dark"])
    expect(await Effect.runPromise(store.preferences.toArray)).toMatchObject([{ id: "theme", mode: "dark" }])
  })

  test("shows what index.html painted from the mirror until the device's preference is restored, not the system's", async () => {
    // The device's last mode was dark, the system's is light: before the store has a row, the page shows dark.
    const { store } = await openStore("light", "dark")
    expect(store.shown()).toBe("dark")
    // Nothing painted yet: the system's.
    expect((await openStore("light")).store.shown()).toBe("light")
  })

  test("follows the system again when the preference is gone", async () => {
    const { store, painted } = await openStore("dark")
    await Effect.runPromise(store.write("light"))
    await until(() => painted.at(-1) === "light")

    await Effect.runPromise(store.preferences.delete("theme"))
    await until(() => painted.at(-1) === "dark")

    expect(await Effect.runPromise(store.current)).toBe("dark")
  })

  test("the tab's Preferences and its answers to the engine worker write the same store", async () => {
    const { run, store, painted } = await openStore()
    const handlers = await run(tabHandlers)

    await run(Effect.flatMap(Preferences, (prefs) => prefs.setTheme("dark")).pipe(Effect.provide(tabPreferences)))
    await until(() => painted.at(-1) === "dark")
    const answered = await run(handlers["app/theme/write"]!({ mode: "light" }))
    const refused = await run(Effect.exit(handlers["app/theme/write"]!({ mode: "sepia" })))
    await until(() => painted.at(-1) === "light")

    expect(answered).toBeNull()
    expect(Exit.isFailure(refused)).toBe(true)
    expect(painted).toEqual(["dark", "light"])
    expect(await Effect.runPromise(store.current)).toBe("light")
  })
})

describe("the engine worker's Preferences", () => {
  const over = (call: TabPort["Service"]["call"]) =>
    Effect.runPromise(
      Effect.exit(Effect.flatMap(Preferences, (prefs) => prefs.setTheme("dark"))).pipe(
        Effect.provide(workerPreferences),
        Effect.provide(Layer.succeed(TabPort, TabPort.of({ call }))),
      ),
    )

  test("asks its tab to write the mode", async () => {
    const calls: Array<unknown> = []

    const exit = await over((method, input) => Effect.sync(() => (calls.push([method, input]), null)))

    expect(exit).toEqual(Exit.void)
    expect(calls).toEqual([["app/theme/write", { mode: "dark" }]])
  })

  test("a tab that doesn't answer is PreferencesUnavailable", async () => {
    const exit = await over((method) => Effect.fail(new TabCallFailed({ method, reason: "timeout" })))

    expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new PreferencesUnavailable())
  })
})

describe("the theme button's toggle", () => {
  /** The theme layer over a store and dispatch on the Node host's engine. */
  const openTheme = async (system: ThemeMode) => {
    const scope = Effect.runSync(Scope.make())
    disposables.push(() => Effect.runPromise(Scope.close(scope, Exit.void)))
    const painted: Array<ThemeMode> = []
    const store = ThemeStore.layer({
      paint: (m) => void painted.push(m),
      mirror: () => {},
      system: () => system,
      painted: () => painted.at(-1),
    })
      .pipe(Layer.provide(Persistence.memory))
    const { context } = await Effect.runPromise(
      Scope.provide(scope)(
        build(
          registration.pipe(
            Layer.provideMerge(Action.layerImplementations),
            Layer.provide(tabPreferences),
            Layer.provideMerge(store),
          ),
        ),
      ),
    )
    const theme = await Effect.runPromise(
      Scope.provide(scope)(
        Layer.build(
          Theme.layer.pipe(
            Layer.provide(FlowDispatch.layer),
            Layer.provide(ClientEngine.layerRuntime([SetTheme])),
            Layer.provide(Layer.succeedContext(context)),
          ),
        ),
      ).pipe(Effect.map((built) => Context.get(built, Theme))),
    )
    return { theme, painted, current: Context.get(context, ThemeStore).current }
  }

  test("switches from the system's mode to the other, then back, through app/theme/set", async () => {
    const { theme, painted, current } = await openTheme("dark")

    await theme.actions.toggle()
    await theme.actions.toggle()

    expect(painted).toEqual(["light", "dark"])
    expect(theme.queries.shown()).toBe("dark")
    expect(await Effect.runPromise(current)).toBe("dark")
    expect(theme.queries.theme.id).toEqual(expect.any(String))
  })
})
