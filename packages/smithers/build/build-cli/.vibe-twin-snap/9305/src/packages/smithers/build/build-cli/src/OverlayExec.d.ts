/**
 * Consumer-scoped source overlays for build-system execution.
 *
 * Overlay declarations stay inert file-set values. A consumer whose `data`
 * closure reaches one receives the replacement files in a scratch workspace,
 * leaving the real source tree untouched.
 *
 * @since 0.1.0
 */
import * as Target from "@smthrs/targets/Target";
/** One replacement applied to a consumer scratch tree.
 *
 * @category models
 * @since 0.1.0
 */
export interface Replacement {
    readonly overlay: string;
    readonly path: string;
    readonly source: string;
    readonly digest: string;
}
/** A resolved overlay closure, or a typed planning refusal.
 *
 * @category models
 * @since 0.1.0
 */
export type Resolution = {
    readonly replacements: ReadonlyArray<Replacement>;
    readonly refusal?: undefined;
} | {
    readonly replacements: ReadonlyArray<Replacement>;
    readonly refusal: string;
};
/**
 * Resolves every Overlay reachable from a target's data/filegroup closure.
 * Replacement destinations and source files are anchored to the Overlay's
 * declaring package, not to the eventual consumer.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const resolve: (options: {
    readonly root: string;
    readonly consumer: Target.AnyTarget;
    readonly packagePathOf: (target: Target.AnyTarget) => string;
    readonly labelOf: (target: Target.AnyTarget) => string;
}) => Promise<Resolution>;
/** Applies replacements to a scratch workspace without touching the source tree.
 * Paths must stay inside scratch. Destination directory links are refused;
 * an internal final file link is replaced, leaving its target untouched.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const apply: (root: string, replacements: ReadonlyArray<Replacement>) => Promise<void>;
