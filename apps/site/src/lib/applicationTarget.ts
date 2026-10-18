import type { ApplicationTargetDocument } from "@smthrs/rpc/ApplicationTarget"

/** The hosted site serves the common API through its stateless same-origin edge. */
export const applicationTarget = {
  apiVersion: 1,
  mode: "web-plue",
  apiOrigin: "",
  auth: { kind: "session" },
  cors: "same-origin",
  developerExternal: false,
  frontDoor: { repo: "smithers-canary/smithers", path: ".smithers/front-door.json" }
} satisfies ApplicationTargetDocument
