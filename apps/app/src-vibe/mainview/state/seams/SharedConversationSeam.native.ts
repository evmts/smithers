// E-7 (EK4402): the page's visibility is a browser platform object; these one-line wrappers are
// exactly the `document` touches SharedConversationSeam.ts makes.

/** `typeof document !== "undefined" && document.hidden`. */
export const pageHidden = (): boolean => typeof document !== "undefined" && document.hidden

/** `if (typeof document !== "undefined") document.addEventListener("visibilitychange", listener)`. */
export const watchVisibility = (listener: () => void): void => { if (typeof document !== "undefined") document.addEventListener("visibilitychange", listener) }

/** `if (typeof document !== "undefined") document.removeEventListener("visibilitychange", listener)`. */
export const unwatchVisibility = (listener: () => void): void => { if (typeof document !== "undefined") document.removeEventListener("visibilitychange", listener) }
