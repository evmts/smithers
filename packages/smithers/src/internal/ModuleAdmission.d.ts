/** Refuses adoption of persisted module roots by an unconfigured executor.
 * @since 1.0.0
 */
import type { ControlRuntime } from "@smthrs/control";
import type * as Executable from "@smthrs/registry/Executable";
import type * as Registry from "@smthrs/registry/Registry";
import type { RunStore } from "@smthrs/run-store";
import { Effect } from "effect";
/** Uses existing native state, approved plans and the host's frozen catalog. */
interface Options {
    readonly runs: RunStore.Service;
    readonly control: ControlRuntime.Service;
    readonly registry: Registry.Registry;
    readonly catalog: Executable.Catalog | undefined;
}
/** This is admission before claiming, so refusals leave work for its owning host.
 * @since 1.0.0
 * @private
 */
export declare const make: ({ runs, control, registry, catalog }: Options) => (runId: string, native?: RunStore.RunRow) => Effect.Effect<boolean>;
export {};
