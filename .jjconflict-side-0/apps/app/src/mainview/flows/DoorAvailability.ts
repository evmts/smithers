/*
 * Whether this origin serves a DOOR FAMILY, and the one rule every trigger
 * reads before it offers one.
 *
 * A door family is a group of flows that exist only where the host mounted
 * their route family. Two of them answer this way, because the MVP's install
 * serves both and the hosted origin serves neither (AGENTS.md M-09: "Smithers
 * Cloud, billing and plans come after the MVP"):
 *
 * - `todo` — the `/api/todos*` family. `compose/router.go` mounts it under
 *   `config.IsSingleOwner(cfg.Auth) && extras.Mythical != nil`. The Mythical
 *   handler is composed unconditionally (`compose/main.go` builds
 *   `mythicalHandler` for every topology), and the bootstrap's `install` row is
 *   emitted from `gitHubAppSetup != nil` (`compose/bootstrap.go`), which
 *   `compose/main.go` assigns inside `if config.IsSingleOwner(cfg.Auth)` and
 *   nowhere else. So `install` IS that mount condition, stated by the process
 *   that mounted it — not an inference from `host`.
 * - `wiki` — the repository Wiki family, mounted under `wikiService != nil` and
 *   refused per request by `FeatureFlagGate(cfg.FeatureFlags.Wiki)`
 *   (`compose/router.go`). No bootstrap row states it, so the only authority is
 *   the gate's own verdict on the wire: once this origin has refused a Wiki
 *   call with plue's `forbidden` verdict and the gate's sentence
 *   (`seams/SeamContext.isFeatureGateRefusal`), the family is known absent
 *   HERE. An origin whose Wiki is enabled never answers that way, so an
 *   enabled Cloud Wiki and an install Wiki are never withdrawn, and nothing is
 *   concluded from `host === "cloud"` alone.
 *
 * `unknown` is the state that matters. It is NOT absent: a bootstrap that has
 * not loaded, and a family whose host has said nothing either way, both leave
 * the door offered. An honest product may refuse a door its host has refused;
 * it may never hide a working feature on a guess.
 */
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"

/** A route family a host either mounts or does not; the flows in it declare it as `door`. */
export type DoorFamily = "todo" | "wiki"

/** What is known about a door family on THIS origin. `unknown` is offered, never hidden. */
export type DoorState = "served" | "absent" | "unknown"

/** What the rule may read: the host's own bootstrap, and the proofs its own answers left. */
export interface DoorEvidence {
  /** Undefined while the bootstrap is still loading — honest loading, never absence. */
  readonly bootstrap?: Pick<AppBootstrap, "capabilities">
  /** Families this origin's own refusal has already proven absent ({@link DoorLedger}). */
  readonly refused?: (family: DoorFamily) => boolean
  /**
   * The seeded design world answers this page's writes (`design.enabled`:
   * `services.designFixture === true || services.bootstrap === undefined`, and
   * never on an install). Both families have a seed behind them there
   * (`seams/DesignWorld/todo.ts` `withDesignTodos`, `flows/entries/subjects.ts`),
   * so the door works whatever the server mounts.
   *
   * Read only to ADMIT a door, never to refuse one: gating a real surface on
   * `design.enabled` is what broke every hosted box in
   * [#3865](https://github.com/smithersai/smithers/issues/3865), because the
   * hosted app serves `cloud` with the fixture off.
   */
  readonly seeded?: boolean
}

/**
 * The one rule. Both the catalog's availability filter
 * (`flows/Commands.available`) and its honest refusal
 * (`flows/registry.absentDoor` → `Commands.explainAbsent`) read it, so the
 * answer buttons, the palette, the slash line, a direct form submit and the
 * agent's call cannot disagree about whether a door runs here.
 *
 * A refusal this origin already answered outranks the bootstrap: it is the
 * strongest statement a host can make about its own routes, and it is true
 * even before a bootstrap has loaded.
 */
export const doorState = (family: DoorFamily, evidence: DoorEvidence): DoorState => {
  // A design build's own seed answers the door; nothing a server says withdraws it.
  if (evidence.seeded === true) return "served"
  if (evidence.refused?.(family) === true) return "absent"
  const bootstrap = evidence.bootstrap
  if (bootstrap === undefined) return "unknown"
  // The install row is the TODO family's mount condition; no row states the Wiki's.
  if (family === "todo") return bootstrap.capabilities.includes("install") ? "served" : "absent"
  return "unknown"
}

/** Whether a flow declaring this door may NOT run here. Undefined `door`: not a door-family flow. */
export const doorFamilyAbsent = (door: DoorFamily | undefined, evidence: DoorEvidence): boolean =>
  door !== undefined && doorState(door, evidence) === "absent"

/**
 * The page's record of what this origin's own answers proved about its door
 * families.
 *
 * In memory for the page's lifetime and never persisted: an origin that turns
 * the Wiki on must be believed on the next load, so a stale "absent" can never
 * outlive the answer that produced it. It is a property of the ORIGIN, not of
 * the account, so ending an account generation does not clear it.
 */
export interface DoorLedger {
  readonly absent: (family: DoorFamily) => boolean
  /** Record the proof; idempotent, and never a second failure for the caller. */
  readonly record: (family: DoorFamily) => void
}

export const createDoorLedger = (): DoorLedger => {
  const absent = new Set<DoorFamily>()
  return { absent: (family) => absent.has(family), record: (family) => { absent.add(family) } }
}
