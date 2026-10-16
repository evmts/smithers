// `issues.transition` (#4027) moves an issue through a transition the TARGET
// repository declares in its own `.smithers/FACTORY.ts`. The reference
// repositories this suite drives declare none, so the reference host has no
// declared move to make and the sibling GitHub-tracker acts
// (issues.comment/close/reopen, issues.spec.ts) cannot stand in for it. The
// real-host scenario is owed with the repository declaration that admits it;
// delete this entry in the change that adds that scenario.
export const issues = [
  "issues.transition",
  ] as const
