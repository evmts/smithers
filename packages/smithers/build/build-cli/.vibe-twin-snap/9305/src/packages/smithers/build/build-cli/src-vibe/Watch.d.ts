/** Dependency-aware execution in fresh processes, with cancellation on file changes.
 * @since 0.1.0
 */
/** Runs fresh CLI processes until interrupted, cancelling stale work when an input changes.
 * @category execution
 * @since 0.1.0
 */
export declare const run: (options: {
    readonly root: string;
    readonly args: ReadonlyArray<string>;
    readonly ignored: ReadonlyArray<string>;
    readonly signal?: AbortSignal | undefined;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly debounceMs: number;
    /** How often the workspace is rescanned for changes the notifier dropped. Defaults to 1000 ms. */
    readonly rescanMs?: number | undefined;
    readonly once: boolean;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
    readonly cycleCompleted?: ((cycle: {
        readonly number: number;
        readonly exitCode: number;
        readonly output: string;
    }) => void) | undefined;
}) => Promise<{
    cycles: number;
    exitCode: number;
    stopped: boolean;
}>;
