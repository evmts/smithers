# 0080: A refused new conversation stays retryable

2026-10-23. Production regression, no new feature or UI copy.

`/new` uses the branch creation route and the deployment's forge. From home
it names `GITHUB_REPOSITORY`; from a branch it names that branch's repository.
Code Storage needs an existing mirror with a default branch. Membership grants
permission to create a branch, and does not provision a mirror. GitHub's
single-repository writes endpoint is not on this path.

The production browser record shows `conversation.new` ending `not_found` and
remaining on `/app`. It does not identify whether the forge lacked its mirror
or default branch. The command cleared the composer and ignored its failure.

Restore the submitted line and reuse New branch's existing `Couldn't make a
branch` status on both declared failure and unavailable dispatch. Keep the
submission asynchronous. Fence the restoration with the command menu's act
revision, the current draft and the selected conversation, so an older failure
cannot replace the person's newer work. A dismissal advances the revision even
when its row already has no items.

The existing successful browser spec remains unchanged. Its success requires
the deployment repository's writable Code Storage mirror. Do not claim that a
visible refusal proves successful branch creation, and do not treat a real
refusal as a flake.
