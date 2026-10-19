// E-7 (EK4402): the fast model sign-in leaves the app through the browser's location; this is
// exactly the `window` touch InstallSeam.ts makes.

/** `window.location.assign(url)`. */
export const assignLocation = (url: string): void => window.location.assign(url)
