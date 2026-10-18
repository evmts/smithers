// A-1/B-4: proxy traps and placeholder construction retain their synchronous refusal API.
import { GraphBuildError } from "./GraphBuildError.vibe"
import { TypeId, type Reference, type Planned } from "./Planned.vibe"
/**
 * The operations that are computation rather than reference, keyed by the
 * property that performs them. `toJSON` is here because `JSON.stringify` reads
 * it, and a plan that serialized a placeholder would look correct.
 *
 * @private
 */
const refusals = new Map<PropertyKey, string>([
  [Symbol.toPrimitive, "Symbol.toPrimitive"],
  ["valueOf", "valueOf"],
  ["toString", "toString"],
  ["toJSON", "toJSON"]
])

/** @private */
const describe = (reference: Reference): string =>
  reference.path.length === 0 ? reference.node : `${reference.node}.${reference.path.join(".")}`

/**
 * The one refusal this module raises. The guidance is spelled out rather than
 * linked because the author reading it is inside a body and needs the
 * correction on the spot.
 *
 * @private
 */
const refuse = (reference: Reference, operation: string): GraphBuildError =>
  new GraphBuildError({
    code: "planned_value_computed",
    node: reference.node,
    path: reference.path,
    message: `Planned value ${describe(reference)} was computed at plan time by ${operation}. ` +
      "Use Node.map to compute, Node.branch to decide, or pass the value into a payload."
  })

/**
 * The proxy itself. `_T` of {@link Identity} is a phantom and never exists at
 * run time, so the trap carries the plain {@link Reference}.
 *
 * @private
 */
const placeholder = (reference: Reference): unknown => {
  /* v8 ignore next -- a Proxy application always enters the `apply` trap below, so the callable target is unreachable by construction */
  const target = (): undefined => undefined
  return new Proxy(target, {
    get: (_target, key) => {
      if (key === TypeId) return reference
      const refusal = refusals.get(key)
      if (refusal !== undefined) throw refuse(reference, refusal)
      // Not a thenable: a body that returns a planned value inside a promise
      // must resolve to the placeholder, not hang awaiting a proxy.
      if (key === "then") return undefined
      return placeholder({ node: reference.node, path: [...reference.path, String(key)] })
    },
    apply: () => {
      throw refuse(reference, "function application")
    },
    has: () => {
      throw refuse(reference, "property existence (`in`)")
    },
    ownKeys: () => {
      throw refuse(reference, "property enumeration")
    }
  })
}

export const make = <T>(node: string): Planned<T> => placeholder({ node, path: [] }) as Planned<T>

