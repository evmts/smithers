// E-7 (EK4402): AppStore's reads and writes of the browser's own state (window, document,
// localStorage, navigator's OPFS root and Web Locks, console) are platform calls VibeLang code
// does not make. AppStore.vibe calls these exactly where AppStore.ts touches the platform; each
// is that expression, verbatim.

/** `FileSystemDirectoryHandle.keys()` is in the spec, not yet in this TS lib. */
type OpfsDirectory = FileSystemDirectoryHandle & { readonly keys: () => AsyncIterableIterator<string> }

/** `typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches`. */
export const prefersDarkScheme = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches

/** `if (typeof document !== "undefined") document.documentElement.dataset[key] = value`. */
export const stampDocument = (key: "theme" | "palette", value: string): void => {
  if (typeof document !== "undefined") document.documentElement.dataset[key] = value
}

/** `typeof localStorage === "undefined" ? undefined : localStorage`; the read itself may throw. */
export const globalLocalStorage = (): Storage | undefined => typeof localStorage === "undefined" ? undefined : localStorage

/** `typeof window === "undefined" ? undefined : window.localStorage`; the read itself may throw. */
export const windowLocalStorage = (): Storage | undefined => typeof window === "undefined" ? undefined : window.localStorage

/** `typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"`. */
export const hasOpfs = (): boolean => typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"

/** `navigator.storage.getDirectory()`. */
export const opfsDirectory = (): Promise<FileSystemDirectoryHandle> => navigator.storage.getDirectory()

/** `for await (const name of root.keys())`: every entry name, in order. */
export const opfsEntryNames = async (root: FileSystemDirectoryHandle): Promise<Array<string>> => {
  const names: Array<string> = []
  for await (const name of (root as OpfsDirectory).keys()) names.push(name)
  return names
}

/** `new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(reason()), ms) })`, and its `clearTimeout`. */
export const rejectAfter = (ms: number, reason: () => unknown): { readonly promise: Promise<never>; readonly clear: () => void } => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(reason()), ms)
  })
  return { promise, clear: () => { if (timer !== undefined) clearTimeout(timer) } }
}

/** `console.warn(...data)`. */
export const consoleWarn = (...data: Array<unknown>): void => console.warn(...data)

/** `console.error(...data)`. */
export const consoleError = (...data: Array<unknown>): void => console.error(...data)

/** `console.debug(...data)`. */
export const consoleDebug = (...data: Array<unknown>): void => console.debug(...data)

/** `window.location.reload()`. */
export const reloadPage = (): void => window.location.reload()

/** `globalThis.navigator?.locks != null`. */
export const hasWebLocks = (): boolean => globalThis.navigator?.locks != null

/** `typeof window === "undefined" || typeof window.addEventListener !== "function" ? undefined : window`. */
export const pageEvents = (): Window | undefined =>
  typeof window === "undefined" || typeof window.addEventListener !== "function" ? undefined : window
