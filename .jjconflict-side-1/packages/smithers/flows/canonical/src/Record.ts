/**
 * Object-shape checks used before walking untrusted values.
 *
 * @since 1.0.0
 */

/**
 * Narrows a typed JSON-like value while preserving its member type.
 *
 * @param value - Candidate container or primitive.
 * @returns True for a non-null object that is not an array.
 *
 * @since 1.0.0
 * @category guards
 */
export function isRecord<A>(
  value: Readonly<Record<string, A>> | ReadonlyArray<A> | string | number | boolean | null | undefined
): value is Readonly<Record<string, A>>
/**
 * Accepts non-null objects and excludes arrays. This is a shape guard, not
 * a plain-object or JSON validator: it neither reads properties nor rejects
 * class instances.
 *
 * @param value - Any candidate value.
 * @returns True for a non-null object that is not an array.
 * @throws Propagates Array.isArray errors for revoked proxies.
 *
 * @since 1.0.0
 * @category guards
 */
export function isRecord(value: unknown): value is Record<string, unknown>
/**
 * Checks the container without inspecting its members.
 *
 * @param value - Any candidate value.
 * @returns True for a non-null object that is not an array.
 * @throws Propagates Array.isArray errors for revoked proxies.
 *
 * @since 1.0.0
 * @category guards
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
