// E-7 (EK4402): node:os and node:path are platform APIs that VibeLang code does
// not call directly; GatewayHistory.vibe names the host's paths through these,
// exactly as GatewayHistory.ts does.
// A-2/E-4 (D38): VibeLang has no async or await outside a hatch (EK1003);
// `awaitThen(start, then)` is `async () => then(await start())`, the shape of
// GatewayHistory.ts's served bodies.
import { homedir as nodeHomedir, tmpdir as nodeTmpdir } from "node:os"
import { resolve as nodeResolve } from "node:path"

/** `path.resolve`. */
export const resolve = (path: string): string => nodeResolve(path)

/** `os.tmpdir`. */
export const tmpdir = (): string => nodeTmpdir()

/** `os.homedir`. */
export const homedir = (): string => nodeHomedir()

/** Awaits `start`, then maps its value. */
export const awaitThen = async <A, B>(start: () => Promise<A>, then: (value: A) => B): Promise<B> =>
  then(await start())
