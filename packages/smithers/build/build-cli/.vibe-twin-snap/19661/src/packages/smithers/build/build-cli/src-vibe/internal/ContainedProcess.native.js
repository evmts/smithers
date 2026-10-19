// A-2/E-4 (D38): `run` hands a Promise to TypeScript callers through Effect.runPromiseExit,
// a runner boundary, so its body stays TypeScript, unchanged from ContainedProcess.ts.
// S3-1: `restore` must wrap the scoped program itself. VibeLang passes a call argument by name
// through a generator frame, which keeps the fiber interruptible for one more op after the
// process settled; this is the TypeScript expression `restore(Effect.scoped(bounded))`.
import { Cause, Effect, Exit } from "effect";
import { ProcessError, runEffect } from "./ContainedProcess.js";
const processError = (cause) => cause instanceof ProcessError ? cause : new ProcessError("process_failed", "process execution failed", cause);
/** `restore(Effect.scoped(program))`, the program held as a function. */
export const restoreScoped = (restore, program) => restore(Effect.scoped(Effect.suspend(program)));
/** The Promise boundary: ContainedProcess.ts `run`, unchanged. */
export const run = async (options) => {
    const result = await Effect.runPromiseExit(runEffect(options), { signal: options.signal });
    if (Exit.isSuccess(result))
        return result.value;
    const cause = processError(Cause.squash(result.cause));
    if (cause.code === "cleanup_failed")
        throw cause;
    if (options.signal?.aborted)
        throw new ProcessError("cancelled", "process cancelled", options.signal.reason);
    throw cause;
};
