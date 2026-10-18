/** The host page's origin, which a framed or linked page must not share. None on the server. */
export function hostOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}
