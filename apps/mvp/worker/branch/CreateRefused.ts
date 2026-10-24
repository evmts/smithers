import { Data } from "effect"

/**
 * The forge didn't create a branch: one of that name exists (`exists`), it has no such repository or start (`not_found`),
 * it can't create branches here (`not_configured`: GitHub read with no credential), the provider denied the write
 * (`forbidden`: HTTP 401/403), or it didn't answer (`unavailable`).
 */
export class CreateRefused extends Data.TaggedError("CreateRefused")<{
  readonly code: "exists" | "not_found" | "not_configured" | "forbidden" | "unavailable"
  readonly errorTag?: string
  readonly errorCode?: string
  readonly errorStatus?: number
}> {}

