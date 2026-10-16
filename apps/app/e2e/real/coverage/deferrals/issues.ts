// `issues.transition` (#4027) moves an issue through a transition the TARGET
// repository declares in its own `.smithers/FACTORY.ts`. It was entered here
// while no real scenario drove that declaration; the entry said to delete it
// in the change that adds the scenario, and this is that change:
// `issues-transition.spec.ts` drives the declared proposed-to-accepted move
// of a repository that commits the declaration
// `e2e/real/support/issue-policy-fixture.ts` carries, so the ledger accounts
// for nothing in the issues family.
export const issues = [] as const
