import { Effect } from "effect";
import type { run as Run } from "./Watch.vibe";
type Options = Parameters<typeof Run>[0];
/** Watch.ts `run`'s variables, shared by the cycles, the watcher and this boundary. */
export interface State {
    baseline: string | undefined;
    baselineObserved: number;
    cycles: number;
    exitCode: number;
    failure: unknown;
    observed: number;
    covered: number;
}
/** `run`'s Promise boundary, unchanged. */
export declare const run: (options: Options, watching: (options: Options, state: State) => Effect.Effect<void, unknown, never>) => Promise<{
    cycles: number;
    exitCode: number;
    stopped: boolean;
}>;
/**
 * A digest of every relevant path's type, size, modification time and inode,
 * in name order. Entries that vanish or cannot be read mid-walk are skipped.
 */
export declare const digest: (root: string, relevant: (path: string) => boolean) => Promise<string>;
export {};
