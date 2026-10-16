/**
 * The release pins every migrated project ends on.
 *
 * Scan-side, so the detector can judge a manifest against them without loading
 * the flow lane, and re-exported by `flow/Archive`, which writes them into
 * manifests.
 *
 * @since 1.0.0-rc.0
 * @private
 */

/**
 * The Effect version every migrated project installs: the release this version
 * of Smithers is built and tested on. One pin, repository wide, in every field
 * that installs `effect` or an Effect adapter.
 *
 * @since 1.0.0-rc.0
 * @private
 */
export const effectVersion = "4.0.4"

/**
 * The Effect range a migrated manifest's `peerDependencies` end on: the range
 * every published `@smthrs/*` library accepts. A peer is installed by whoever
 * consumes the migrated package, so it carries what Smithers supports, not the
 * one release the migration ran on.
 *
 * @since 1.0.0-rc.5
 * @private
 */
export const effectRange = "^4.0.4"

/**
 * What the `effect` entry of one manifest field ends on: {@link effectRange}
 * in `peerDependencies`, {@link effectVersion} in every field that installs.
 *
 * @since 1.0.0-rc.5
 * @private
 */
export const effectPinFor = (field: string): string => field === "peerDependencies" ? effectRange : effectVersion

/**
 * The version every `@smthrs/*` package a migrated project depends on ends on:
 * this package's own release version, so a migration installs the release that
 * wrote it. A packed install cannot read its manifest at run time, so the
 * literal repeats it; `scripts/set-release-version.mjs` rewrites it on a bump
 * and `test/flow/Dependencies.test.ts` pins it to `package.json`.
 *
 * @since 1.0.0-rc.0
 * @private
 */
export const smithersVersion = "1.0.0-rc.10"
