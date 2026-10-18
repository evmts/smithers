/**
 * What a host does when one of its own runs has written a flow file.
 *
 * The observer that copies the engine's records into the control journal is
 * what learns this, and it learns it in the middle of copying a run's
 * evidence across. So the reaction has two rules, and they pull against each
 * other. A rebuild that FAILS must not take the run's evidence with it: a
 * flow file that does not compile is an ordinary state of a directory people
 * edit, and losing the whole observation over one would take the run's node
 * settlements, its approvals and its outcome with it. An INTERRUPT is not
 * that. It is the host shutting down, and reporting it as a completed rebuild
 * would let the copy carry on inside a scope that is closing — so it is
 * re-raised, and the observation ends the way everything else in that scope
 * does.
 *
 * @since 1.0.0
 * @private
 */
import type * as Executable from "@smthrs/registry/Executable";
import * as Effect from "effect/Effect";
/**
 * Rebuilds the named flow's catalog entry, saying out loud what happened.
 *
 * @since 1.0.0
 * @private
 */
export declare const rebuild: (refresh: Executable.Refresh) => (flowId: string) => Effect.Effect<void>;
