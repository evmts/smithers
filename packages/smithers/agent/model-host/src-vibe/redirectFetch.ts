// EK1003 (E-4): a fetch wrapper is an async function handed to TypeScript callers
// (FetchHttpClient, the context and fast-selection callbacks), a Promise boundary
// VibeLang does not write. `LocalModel.manualRedirects` and
// `EnvironmentResolver`'s refusing transport wrap the host fetch through these.

/** Fetch that never follows a redirect and reports the 3xx status it was answered. */
export const redirectRecordingFetch = (
  base: typeof globalThis.fetch,
  record: (status: number) => void
): typeof globalThis.fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, { ...init, redirect: "manual" })
    if (response.status >= 300 && response.status < 400) record(response.status)
    return response
  }) as typeof globalThis.fetch

/**
 * A fetch that never follows a redirect. A provider 3xx rejects the call, so
 * a custom key header such as x-api-key cannot ride a redirect to another
 * origin; fetch strips only Authorization on a cross-origin hop.
 */
export const refusingRedirects = (base: typeof globalThis.fetch): typeof globalThis.fetch => {
  const guarded = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, { ...init, redirect: "manual" })
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel()
      throw new Error("model provider redirect refused")
    }
    return response
  }) as typeof globalThis.fetch
  return guarded
}
