// E-7: keep the synchronous native timer API in a minimal TypeScript hatch.
export const cancelBrowserTimer = (timer: unknown): void => clearTimeout(timer as ReturnType<typeof setTimeout>)
