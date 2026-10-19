import { admitStrict } from "@smthrs/canonical/BoundedJson"
import { canonicalize } from "@smthrs/canonical/Serializer"

/**
 * Admits inert JSON input under explicit limits before producing canonical text.
 *
 * @param input - Parsed JSON or another inert value to validate and copy.
 * @returns Canonical text on success, or a path and complaint on refusal.
 * @since 1.0.0-rc.7
 */
export const serializeBoundedInput = (input: unknown) => {
  const admitted = admitStrict(input, {
    maxBytes: 1024,
    maxDepth: 8,
    maxMembers: 32,
    maxNodes: 64,
    maxStringBytes: 128,
    maxKeyBytes: 64
  })
  if (!admitted.ok) return admitted
  return { ok: true as const, text: canonicalize(admitted.value) }
}
