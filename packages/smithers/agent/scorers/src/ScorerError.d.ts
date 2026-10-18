/**
 * Stable scorer failures.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
/**
 * Stable scorer failure codes.
 *
 * - `invalid_declaration`: a scorer declaration this package refuses to give a
 *   durable identity, raised by `Scorer.make` before any flow exists.
 * - `invalid_score`: a scorer returned a result outside the result contract.
 * - `invalid_sampling`: a sampling policy outside the documented vocabulary.
 * - `invalid_observation`: an observation the store refuses to persist.
 * - `invalid_request`: a store call argument outside its documented bounds.
 * - `inconclusive`: a scorer neither scored nor was interrupted.
 * - `constraint`: the database refused the write as a constraint violation,
 *   which retrying cannot fix.
 * - `store`: any other persistence failure, including transient ones.
 *
 * `SqlScoreStore` persists this code, and the `failure_code` CHECK of each
 * score-store migration mirrors these literals. Adding a code here requires a
 * new migration that rebuilds that CHECK, otherwise the store accepts the code
 * and the database refuses the row.
 *
 * @category models
 * @since 0.1.0
 */
export declare const ScorerErrorCode: Schema.Literals<readonly ["invalid_declaration", "invalid_score", "invalid_sampling", "invalid_observation", "invalid_request", "inconclusive", "constraint", "store"]>;
/**
 * Stable scorer failure code.
 *
 * @category models
 * @since 0.1.0
 */
export type ScorerErrorCode = typeof ScorerErrorCode.Type;
declare const ScorerError_base: Schema.Class<ScorerError, Schema.TaggedStruct<"flows/scorers/ScorerError", {
    readonly code: Schema.Literals<readonly ["invalid_declaration", "invalid_score", "invalid_sampling", "invalid_observation", "invalid_request", "inconclusive", "constraint", "store"]>;
    readonly message: Schema.String;
    readonly cause: Schema.optional<Schema.Defect>;
}>, import("effect/Cause").YieldableError>;
/**
 * A typed scorer declaration, execution, or persistence failure.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ScorerError extends ScorerError_base {
}
export {};
