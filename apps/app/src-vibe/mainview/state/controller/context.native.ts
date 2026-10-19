// E-7 (EK4402): the browser's own fetch, bound to its global, is a platform value
// VibeLang code does not take. context.vibe reads it exactly where context.ts does.
import type { FetchLike } from "@smthrs/rpc/NativeAgent"

/** `fetch.bind(globalThis)`. */
export const globalFetch = (): FetchLike => fetch.bind(globalThis)
