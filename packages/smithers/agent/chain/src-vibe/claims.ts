// D-2: synchronous calls to the sibling capability and permission package.
import * as Capability from "@smthrs/capability/Capability"
import * as Permission from "@smthrs/capability/Permission"
import { Option, Schema } from "effect"
export const claimPatternImpl = (declared: string): Option.Option<Capability.CapabilityPattern> => {
  const direct = Capability.parsePattern(declared)
  if (Option.isSome(direct)) return direct
  const components = declared.split(":")
  return components.length === 2
    ? Capability.parsePattern(`${declared}:**`)
    : Option.none()
}

const decodeCapability = Schema.decodeUnknownOption(Capability.Capability)

/**
 * The claim as an exact capability, when it names one. A claim whose action
 * is a family selector (`*`, `ns:*`) or whose resource carries a glob
 * metacharacter selects a SET of capabilities, and `Permission.evaluate`
 * decides one capability at a time, so those stay on the pattern path.
 */
export const exactCapabilityImpl = (claim: Capability.CapabilityPattern): Option.Option<Capability.Capability> =>
  Capability.isLiteralResource(claim.resource)
    ? decodeCapability({ action: claim.action, resource: claim.resource })
    : Option.none()

/**
 * How restrictive an effect is. A rule that covers only PART of a claimed
 * set can raise the verdict for that part, and nothing narrower than the
 * whole set can lower it again: a later `ask` over `secret/public` must not
 * erase a `deny` that still covers `secret/private`.
 */
const restriction: Record<Permission.RuleEffect, number> = { allow: 0, ask: 1, deny: 2 }

/**
 * Evaluates one wildcard claim, which names a set of capabilities rather
 * than a single one.
 *
 * A rule that PROVABLY covers the whole claim is the last word for every
 * member, so whole-set matches are last-match-wins exactly as
 * `Permission.evaluate` orders rules for one capability. A `deny` or `ask`
 * that only may overlap part of the claim can only raise the verdict; it
 * cannot lower a restriction that still governs another member.
 *
 * Both questions are the capability package's to answer: `subsumes` for
 * coverage and `mayOverlap` for the conservative converse. The seam decides
 * the ORDER of rules and never the glob grammar, so a metacharacter added to
 * `@smthrs/capability` reaches this loop without an edit here.
 */
export const evaluatePatternImpl = (
  rules: ReadonlyArray<Permission.Rule>,
  claim: Capability.CapabilityPattern
): Permission.RuleEffect => {
  let verdict: Permission.RuleEffect = "ask"
  for (const rule of rules) {
    if (Capability.subsumes(rule.pattern, claim)) {
      // The rule covers every member of the claim, so it is the last word for
      // all of them: last-match-wins, exactly as `Permission.evaluate` orders
      // rules for one concrete capability.
      verdict = rule.effect
      continue
    }
    // An `allow` that cannot prove it covers the whole set grants nothing.
    if (
      rule.effect !== "allow" && Capability.mayOverlap(rule.pattern, claim) &&
      restriction[rule.effect] > restriction[verdict]
    ) {
      verdict = rule.effect
    }
  }
  return verdict
}

