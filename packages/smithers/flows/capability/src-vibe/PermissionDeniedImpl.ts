// VibeLang limitation EK4814: Schema constructor overrides are rejected (finding owner-1).
/**
 * The refused-capability failure and its constructor.
 *
 * @since 0.1.0
 */

import { Schema } from "effect"
import { Capability } from "./Capability.vibe"
import { capabilitySnapshot } from "./internal/capabilitySnapshot.vibe"

export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()(
  "@smthrs/capability/PermissionDenied",
  {
    code: Schema.Literal("permission_denied"),
    capability: Capability,
    reason: Schema.String
  }
) {
  constructor(props: {
    readonly code?: "permission_denied"
    readonly capability: Capability
    readonly reason: string
  }) {
    super({ ...props, code: "permission_denied" })
    Object.defineProperty(this, "capability", {
      value: capabilitySnapshot(props.capability),
      enumerable: true,
      writable: false,
      configurable: false
    })
  }
}

