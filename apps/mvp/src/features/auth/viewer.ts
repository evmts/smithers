import type { Role } from "./contract"

/** Signed-in status and repository role available to browser actions. */
export interface Viewer {
  readonly signedIn: boolean
  readonly role: Role | null
}

/** ChatApi's current session, falling back to the last confirmed session while reconnecting. */
export const viewerOf = (
  session: { readonly status: "loading" | "signed_in" | "signed_out" | "unreachable"; readonly role: Role | null },
  confirmed: { readonly role: Role | null } | undefined,
): Viewer => {
  if (session.status === "signed_in") return { signedIn: true, role: session.role }
  if (session.status === "signed_out" || confirmed === undefined) return { signedIn: false, role: null }
  return { signedIn: true, role: confirmed.role }
}
