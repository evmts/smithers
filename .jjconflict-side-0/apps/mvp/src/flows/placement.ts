import { Placement } from "@smthrs/plan"

// Placement by need (decision 0011 §2, `flows.local-first-placement` in docs/rules.md): a flow runs on this device
// unless it needs something the device doesn't have. How long it takes never decides.

/**
 * What a flow may need that this device doesn't have; any one runs it remotely:
 * - `server-key`: a key the person must not hold, such as the Code Storage organization key;
 * - `machine`: a machine to run code on;
 * - `devices-off`: to happen while every device is off, such as a webhook or a schedule.
 */
export const NEEDS = ["server-key", "machine", "devices-off"] as const

/** One of {@link NEEDS}. */
export type Need = (typeof NEEDS)[number]

/** Where a flow runs: this device's engine, or the server's. */
export type Where = "client" | "remote"

/** Where a flow with `needs` runs: remotely only when it needs something. */
export const whereFor = (needs: ReadonlyArray<Need>): Where => (needs.length === 0 ? "client" : "remote")

/** The placement directive a flow running `where` declares with `Flow.Placement`. */
export const directiveFor = (where: Where): Placement.Placement =>
  where === "client" ? Placement.client() : Placement.remote()
