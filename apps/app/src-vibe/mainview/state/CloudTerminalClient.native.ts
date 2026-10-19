// E-7 (EK4402): the page's own origin and the browser WebSocket constructor are platform calls.

/** `window.location.origin`. */
export const pageOrigin = (): string => window.location.origin

/** The production socket: the browser WebSocket constructor. */
export const browserSocket = (url: string, protocols?: ReadonlyArray<string>): WebSocket =>
  protocols === undefined ? new WebSocket(url) : new WebSocket(url, [...protocols])

/** `WebSocket.OPEN`, read when the TypeScript reads it (S21-40: EK4402 reports the constant read). */
export const socketOpen = (): number => WebSocket.OPEN
