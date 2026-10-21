# smithers/lint: each package a change touches passes its own `lint` script. Smithers runs it with sh at the
# pull request's head, on the head's throwaway job machine, whose egress reaches the npm registry and dprint's plugins
# only (apps/mvp/docs/features/pulls.md#where-checks-run).
set -eu
git fetch --quiet --depth=50 origin main
# The change is what this head adds since it left main, so packages main changed since aren't counted as the change's.
base=$(git merge-base HEAD FETCH_HEAD)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
# `[$base]` is every package with a file this head changed; `...` adds what each depends on, which the scripts read.
pnpm install --frozen-lockfile --filter "[$base]..."
pnpm --filter "[$base]" run --if-present lint
