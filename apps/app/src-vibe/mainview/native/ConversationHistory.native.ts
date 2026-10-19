// E-7 (EK4402): the platform fetch, bound to its global, is a platform value VibeLang code does not touch.
import type { FetchLike } from "@smthrs/rpc/NativeAgent"

/** `fetch.bind(globalThis)`. */
export const platformFetch = (): FetchLike => fetch.bind(globalThis)
