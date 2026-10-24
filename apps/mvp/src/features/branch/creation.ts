import { Schema } from "effect"

/** A selection is journaled before repository code or an external write runs. */
export const CreationSelection = Schema.Struct({
  owner: Schema.String,
  name: Schema.String,
  tag: Schema.String,
  source: Schema.String,
  digest: Schema.String,
  revision: Schema.String,
  runtime: Schema.String,
  allowed: Schema.Array(Schema.String),
})
export type CreationSelection = typeof CreationSelection.Type

/** The only privileged operations a branch creation plugin may request. */
export const CREATION_ACTIONS = {
  "branches/ephemeral": "git:write",
  "branches/github": "github:write",
} as const
export const CREATION_ROUTE = "/api/branches/creation"
