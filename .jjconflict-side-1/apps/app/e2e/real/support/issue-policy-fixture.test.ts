import { expect, test } from "bun:test"
import { FACTORY_PROJECTION_PATH, FactoryProjectionSchema, issueTransitionOf } from "@smthrs/rpc/FactoryProjection"
import {
  committedTransitions,
  declaredNeedsPerson,
  ISSUE_POLICY_ACCEPT,
  ISSUE_POLICY_FACTORY_SOURCE,
  ISSUE_POLICY_PROJECTION,
  ISSUE_POLICY_PROPOSE,
  ISSUE_POLICY_TRANSITIONS,
  ISSUE_POLICY_UNDECLARED,
  issuePolicyFiles,
  issuePolicyLabels,
  issuePolicyRepository,
  transitionPath
} from "./issue-policy-fixture"

/*
 * The declared reference fixture for `issues.transition` (M-47, #4027),
 * checked against the app's OWN projection schema — the module the product
 * decodes `.smithers/factory.json` with (`@smthrs/rpc/FactoryProjection`),
 * not a copy of it.
 *
 * These cases pin the fixture, not the product: that the declaration a
 * fixture repository carries and the projection its own generator renders
 * say the same thing, that the policy is the proposed-to-accepted move the
 * workflow exists for, that it says a PERSON makes it, and that the id the
 * refusal case uses is declared nowhere. A scenario driving a drifted
 * fixture would prove nothing about the repository's policy.
 */

const projection = () => FactoryProjectionSchema.parse(JSON.parse(ISSUE_POLICY_PROJECTION))

test("the fixture declares the proposed-to-accepted move, and both halves of it are a person's", () => {
  const accept = issueTransitionOf(projection(), ISSUE_POLICY_ACCEPT.id)
  expect(accept).toEqual({ id: "e2e-accept", title: "Accept the proposal", from: "smithers-e2e-proposed", to: "smithers-e2e-accepted", actor: "person" })
  expect(issueTransitionOf(projection(), ISSUE_POLICY_PROPOSE.id)?.to).toBe(accept!.from)
  for (const transition of ISSUE_POLICY_TRANSITIONS) expect(declaredNeedsPerson(ISSUE_POLICY_PROJECTION, transition.id)).toBe(true)
  // The refusal case's id is declared nowhere, so the refusal is the
  // repository's own declaration and not a shape rule.
  expect(issueTransitionOf(projection(), ISSUE_POLICY_UNDECLARED)).toBeUndefined()
  expect(/^[a-z0-9][a-z0-9-]{0,63}$/.test(ISSUE_POLICY_UNDECLARED)).toBe(true)
})

test("the committed projection carries exactly the declared transitions, in declaration order", () => {
  expect(committedTransitions(ISSUE_POLICY_PROJECTION)).toEqual(ISSUE_POLICY_TRANSITIONS)
  expect(projection().github).toEqual({ mirror: "pull", issues: "two-way", changes: "send-upstream" })
})

test("the declaration source and the rendered projection cannot drift apart", () => {
  const declared = [...ISSUE_POLICY_FACTORY_SOURCE.matchAll(/\{ id: "([a-z0-9-]+)"/g)].map((match) => match[1])
  expect(declared).toEqual(ISSUE_POLICY_TRANSITIONS.map((transition) => transition.id))
  for (const transition of ISSUE_POLICY_TRANSITIONS) {
    expect(ISSUE_POLICY_FACTORY_SOURCE).toContain(`title: "${transition.title}"`)
    expect(ISSUE_POLICY_FACTORY_SOURCE).toContain(`to: "${transition.to}"`)
    expect(ISSUE_POLICY_FACTORY_SOURCE).toContain(`actor: "${transition.actor}"`)
    if (transition.from !== undefined) expect(ISSUE_POLICY_FACTORY_SOURCE).toContain(`from: "${transition.from}"`)
  }
  expect(ISSUE_POLICY_FACTORY_SOURCE).toContain('issueTransitions: [')
  expect(Object.keys(issuePolicyFiles())).toEqual([".smithers/FACTORY.ts", FACTORY_PROJECTION_PATH])
  expect(issuePolicyFiles()[FACTORY_PROJECTION_PATH]).toBe(ISSUE_POLICY_PROJECTION)
  expect(ISSUE_POLICY_PROJECTION.endsWith("}\n")).toBe(true)
})

test("every label the fixture moves is its own, so activating it collides with nothing a repository declares", () => {
  expect(issuePolicyLabels()).toEqual(["smithers-e2e-proposed", "smithers-e2e-accepted"])
  // Namespaced to this fixture: the labels it moves are its own two and no
  // label a repository already carries.
  expect(issuePolicyLabels()).toEqual([ISSUE_POLICY_PROPOSE.to, ISSUE_POLICY_ACCEPT.to])
  expect(new Set(issuePolicyLabels()).has(ISSUE_POLICY_ACCEPT.from!)).toBe(true)
})

test("the declaring repository is named by the run, never invented by the fixture", () => {
  const named = process.env.SMITHERS_REAL_ISSUE_POLICY_REPO
  try {
    delete process.env.SMITHERS_REAL_ISSUE_POLICY_REPO
    expect(() => issuePolicyRepository()).toThrow(FACTORY_PROJECTION_PATH)
    process.env.SMITHERS_REAL_ISSUE_POLICY_REPO = "owner"
    expect(() => issuePolicyRepository()).toThrow("owner/name")
    process.env.SMITHERS_REAL_ISSUE_POLICY_REPO = "owner/name/extra"
    expect(() => issuePolicyRepository()).toThrow("owner/name")
    process.env.SMITHERS_REAL_ISSUE_POLICY_REPO = "owner/declaring"
    expect(issuePolicyRepository()).toBe("owner/declaring")
  } finally {
    if (named === undefined) delete process.env.SMITHERS_REAL_ISSUE_POLICY_REPO
    else process.env.SMITHERS_REAL_ISSUE_POLICY_REPO = named
  }
})

test("the transition door a scenario observes is the repository's own, with the id encoded in the path and no body to carry", () => {
  expect(transitionPath("owner/declaring", 7, ISSUE_POLICY_ACCEPT.id))
    .toBe("/api/repos/owner/declaring/github/issues/7/transitions/e2e-accept")
  expect(transitionPath("owner/name with space", 7, "a/b")).toBe("/api/repos/owner/name%20with%20space/github/issues/7/transitions/a%2Fb")
})
