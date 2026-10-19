// E-7 (EK4402): `window.open` is a browser platform call; CommandGesture.vibe calls it here,
// exactly where CommandGesture.ts does.

/** `window.open("about:blank", "_blank")`. */
export const openBlankWindow = (): Window | null => window.open("about:blank", "_blank")
