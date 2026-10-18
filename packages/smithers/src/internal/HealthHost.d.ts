/** Scoped, bounded health observation beside the native control host.
 * @since 1.0.0
 */
import { Control, Health } from "@smthrs/control";
import type { Journal } from "@smthrs/journal";
import * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, type Scope } from "effect";
/** Run observations only on the host that owns the local journal; no control mutations.
 * Read failures leave the last observation to expire and are retried on the next scan.
 * @since 1.0.0
 * @private
 */
export declare const watch: (registry: Health.Registry) => Effect.Effect<never, never, Control.Control | Journal.Journal | Scope.Scope>;
/** Validate trusted configuration before forking the lifetime-bound observer.
 * @since 1.0.0
 * @private
 */
export declare const start: (config?: Health.HealthConfig) => Effect.Effect<void, never, Control.Control | Evaluator.Evaluator | Journal.Journal | Scope.Scope>;
