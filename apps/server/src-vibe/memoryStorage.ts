// E-5 (D38): a Promise-returning implementation for TypeScript callers stays in
// TypeScript; VibeLang has no `async` (EK1003). `DurableStorage.vibe` rebinds
// `memoryStorage` to this in-memory `NativeStorage` for tests.
import type { NativeStorage, StorageListOptions } from "./DurableStorage.vibe"

export const memoryStorageImpl = (initial?: Record<string, unknown>, retained?: Map<string, unknown>): NativeStorage & { readonly data: Map<string, unknown> } => {
  const data = retained ?? new Map<string, unknown>(Object.entries(structuredClone(initial ?? {})))
  return {
    data,
    get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
    put: async (key, value) => {
      const entries = structuredClone(typeof key === "string" ? [[key, value]] : Object.entries(key)) as Array<[string, unknown]>
      for (const [name, item] of entries) data.set(name, item)
    },
    list: async <T>({ prefix, limit, startAfter }: StorageListOptions) => new Map([...data.entries()]
      .filter(([name]) => name.startsWith(prefix) && (startAfter === undefined || name > startAfter))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, limit).map(([name, item]) => [name, structuredClone(item) as T])),
    delete: async (key: string) => { data.delete(key) }
  }
}
