---
"@smthrs/cli": patch
---

Reading the source revision a plan records no longer takes the git index lock.
On a git checkout where `jj` can't answer, it ran `git status --porcelain`,
which writes the refreshed index back under `.git/index.lock`; meanwhile every
other git and `jj` command in the checkout failed with "Could not acquire lock
for index file". It now runs `git --no-optional-locks status --porcelain`.
