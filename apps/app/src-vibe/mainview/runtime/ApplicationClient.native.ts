// E-7 (EK4402): the browser's cookie jar, page protocol and global fetch are platform reads.
import type { FetchLike } from "@smthrs/rpc/NativeAgent"

/** `document.cookie`, or undefined outside a browser. */
export const documentCookie = (): string | undefined => typeof document === "undefined" ? undefined : document.cookie

/** `location.protocol === "http:"` on a page. */
export const pageIsHttp = (): boolean => typeof location !== "undefined" && location.protocol === "http:"

/** `fetch.bind(globalThis)`. */
export const globalFetch = (): FetchLike => fetch.bind(globalThis)
