#!/bin/bash
# Runs the OpenAI Codex CLI harness on one SWE-bench Verified instance, under
# the same conditions run-instance.sh gives the flows harness: same
# image-derived checkout, same live container for tests, same repository test
# command, same prompt content, same wall-clock budget, and — since 2026-08-23 —
# the same reasoning effort, which defaults to `max` for the current
# comparison. Historical lanes pin their own effort. See SWB_CODEX_EFFORT below.
#
#   run-instance-codex.sh <instance_id> [timeout-seconds] [model] [run-index]
#
# Produces patches-codex/<instance_id>.patch, timings-codex/<instance_id>.json,
# and logs-codex/<instance_id>.*.
#
# With a run index — `run-instance-codex.sh <id> 1500 gpt-6-sol r3` — every one
# of those names carries `-r3`, from the same `lib/run-paths.sh` the flows script
# derives its names from, so a matrix run of five attempts per instance names its
# artifacts identically on both sides. A codex run deletes its workspace only
# after successfully capturing a non-empty patch; failed or empty captures keep it.
#
# This spends real API tokens and needs docker. See README.md.
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
source "$S/lib/remote.sh"
swb_remote_required || exit $?
if [ -z "${SWB_CODEX_CLI:-}" ] || [ ! -x "$SWB_CODEX_CLI" ]; then
  echo 'SWEbench: set SWB_CODEX_CLI to the remote Codex executable.' >&2; exit 2
fi
# The codex arm stays on local docker. It edits the bind-mounted host checkout
# with its own file tools, and a plue workspace has no host checkout; porting
# it means running codex inside the workspace, which is a different arm.
TRANSPORT="$("$S/lib/transport.sh")" || exit 2
if [ "$TRANSPORT" != "docker" ]; then
  echo "run-instance-codex.sh: the codex arm runs on SWB_TRANSPORT=docker only, got '$TRANSPORT'" >&2
  exit 2
fi
# `sealed` by default; `on` needs SWB_CODEX_UNCONFINED=allowed. See the helper.
NETWORK="$("$S/lib/codex-network.sh" run-instance-codex.sh)" || exit 2
INSTANCE="$1"
BUDGET="${2:-1500}"
MODEL="${3:-gpt-6.1-sol}"
INDEX="${4:-}"
DATASET="${SWB_DATASET:-$S/swb-verified.json}"

if [ ! -f "$DATASET" ]; then
  echo "[$INSTANCE] no dataset at $DATASET — run ./bootstrap.sh first"; exit 1
fi
if [ ! -x "$S/.venv-swb/bin/python" ]; then
  echo "[$INSTANCE] no evaluator venv at $S/.venv-swb — run ./bootstrap.sh first"; exit 1
fi

IMAGE_ID="$(echo "$INSTANCE" | sed 's/__/_1776_/')"
IMAGE="swebench/sweb.eval.x86_64.${IMAGE_ID}:latest"

# Every artifact name this run writes, from the one place that knows the rule.
# `run-paths.sh` re-validates the instance id and the index before either reaches
# a path, a container name or an image name.
RUN_PATHS="$("$S/lib/run-paths.sh" codex "$INSTANCE" ${INDEX:+"$INDEX"})" || exit $?
eval "$RUN_PATHS"
mkdir -p "$WORK_ROOT" "$PATCH_ROOT" "$LOG_ROOT" "$TIMINGS_ROOT"
rm -f "$PATCH" "$PATCH.untracked"

source "$S/lib/codex-auth.sh"
swb_codex_version || exit $?
swb_codex_auth || exit $?
CODEX_AUTH="${SWB_CODEX_AUTH:-chatgpt}"

EFFORT="${SWB_CODEX_EFFORT:-max}"
case "$EFFORT" in
  minimal|low|medium|high|xhigh|max) ;;
  *)
    echo "[$RUN_ID] SWB_CODEX_EFFORT must be minimal, low, medium, high, xhigh or max, got '$EFFORT'"; exit 2 ;;
esac

# Keep cleanup armed through capture. The workspace is also the bind-mounted
# container checkout, so removing containers must never remove the retry source.
LOCK="$S/.extract-lock"
TMPC=""
cleanup() {
  if [ -n "$TMPC" ]; then docker rm -f "$TMPC" >/dev/null 2>&1 || true; fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  "$S/lib/lock.sh" release "$LOCK" --owner $$ --quiet || true
}
on_signal() {
  trap '' INT TERM
  cleanup
  trap - EXIT INT TERM
  kill -s "$1" "$$"
}
trap cleanup EXIT
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM


echo "[$RUN_ID] image $IMAGE"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker pull --platform linux/amd64 "$IMAGE" >"$LOG_PREFIX.pull.log" 2>&1 || {
    echo "[$RUN_ID] PULL FAILED"; exit 1; }
fi

# Serialize the testbed extraction across concurrent lanes: docker cp of a
# multi-GB tree is the disk-bandwidth spike, and five at once can fill the
# drive before any lane's cleanup runs.
# `lib/lock.sh` owns the protocol, and the same lock the flows side takes: the
# lock records this process's pid, so a lane that is killed while extracting
# hands the lock straight to the next waiter instead of wedging every later
# extraction in the rig.
"$S/lib/lock.sh" acquire "$LOCK" --owner $$ --label "$RUN_ID extraction" || {
  echo "[$RUN_ID] EXTRACTION LOCK TIMED OUT"; exit 1; }
rm -rf "$WORK"; mkdir -p "$WORK"
# Name it before acquisition so interruption during docker create is covered.
TMPC="${CONTAINER}-extract-$$"
docker create --platform linux/amd64 --name "$TMPC" "$IMAGE" >/dev/null
docker cp "$TMPC:/testbed/." "$WORK/" >/dev/null 2>&1
docker rm -f "$TMPC" >/dev/null 2>&1
TMPC=""
"$S/lib/lock.sh" release "$LOCK" --owner $$

# Same capture base as the flows side: the tree as the image ships it, so the
# image's own pre_install churn cannot enter the patch. Both harnesses are
# captured under one rule or the comparison is not a comparison.
CAPTURE_BASE="$("$S/lib/snapshot-base.sh" "$WORK")"
echo "[$RUN_ID] capture base $CAPTURE_BASE"

# The testbed container's network, from the same place the flows side reads it,
# and for the reason this arm made necessary: `SWB_CODEX_NETWORK=sealed` reaches
# the commands codex spawns on the host and not the processes a
# `docker exec <container> …` starts, so two of the 45 `r90s` runs fetched the
# merged upstream fix from inside the container the seal did not cover.
# `SWB_TESTBED_NETWORK=none` — the default since 2026-08-24 — removes the far
# side of that command from the network entirely. `lib/testbed-network.sh` owns
# the rule and records the docker-measured facts behind it.
TESTBED_NETWORK="$("$S/lib/testbed-network.sh" resolve)" || exit 2

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --platform linux/amd64 --name "$CONTAINER" --network "$TESTBED_NETWORK" \
  -v "$WORK:/testbed" -w /testbed "$IMAGE" sleep infinity >/dev/null 2>&1 || {
  echo "[$RUN_ID] CONTAINER START FAILED"; exit 1; }

# Read back off the live container, and fatal when it disagrees. A sealed lane's
# whole claim is this line, and a claim a run cannot check is the defect the
# `codex-sealed-websearch` lane already cost us once.
TESTBED_OBSERVED="$("$S/lib/testbed-network.sh" assert "$CONTAINER" "$TESTBED_NETWORK")" || {
  echo "[$RUN_ID] TESTBED NETWORK MISMATCH — asked for $TESTBED_NETWORK"; exit 1; }
echo "[$RUN_ID] testbed network $TESTBED_OBSERVED"

# The repository's own test runner, from the same place the flows side reads it.
# It is environment teaching, not an answer — `lib/test-command.py` refuses to
# print a command naming the graded identifiers — and withholding it from one
# side is not a baseline: `python -m pytest` cannot run Django's suite or
# Sphinx's, so a codex run told to verify that way could not verify anything on
# those instances while the harness under test could.
TEST_CMD="$("$S/.venv-swb/bin/python" "$S/lib/test-command.py" "$DATASET" "$INSTANCE")" || {
  echo "[$RUN_ID] NO TEST COMMAND — run ./bootstrap.sh first"; exit 1; }

# How this image runs the project's Python, from the same place the flows side
# reads it, and withheld from neither for the same reason as the test command.
INTERPRETER="$("$S/lib/interpreter.sh" "$CONTAINER" 2>/dev/null)" || INTERPRETER=""

node "$S/lib/write-prompt-codex.mjs" "$DATASET" "$INSTANCE" "$CONTAINER" "$TEST_CMD" "$INTERPRETER" \
  > "$LOG_PREFIX.prompt.md"

# The stock arm never substitutes proxies or an approval bypass for the
# runtime sandbox. Its own API calls still work; spawned network is disabled.
CODEX_ARGS=( --sandbox workspace-write
  -c "sandbox_workspace_write.network_access=false"
  -c "web_search=disabled" )
for PROXY_VAR in HTTP_PROXY HTTPS_PROXY ALL_PROXY FTP_PROXY \
  http_proxy https_proxy all_proxy ftp_proxy; do
  CODEX_ARGS+=( -c "shell_environment_policy.set.${PROXY_VAR}=" )
done
CODEX_ARGS+=( -c "shell_environment_policy.set.NO_PROXY=*" -c "shell_environment_policy.set.no_proxy=*" )
# These are actual shell-tool calls in the same task session, not a separate
# paid probe. The CLI's structured completed items are the evidence. Proper
# sandboxing may refuse the Docker socket: then this transport is unsupported.
{
  printf 'Before working on the issue, run these two exact shell commands separately:\n'
  printf "curl --noproxy '*' --max-time 5 https://example.com\n"
  printf "docker exec %s bash -lc 'exit 0'\n" "$CONTAINER"
  printf 'If either command cannot be run, report that limitation. Never replace the sandbox.\n\n'
  cat "$LOG_PREFIX.prompt.md"
} > "$LOG_PREFIX.session-prompt.md"

# Reasoning effort is a benchmark condition, like the network, and it is pinned
# here rather than inherited. Subscription lanes can select a signed-in Codex
# home, whose user config must not decide this benchmark condition.
#
# It was pinned to the literal `medium` from 2026-08-19 to 2026-08-23, under a
# comment saying medium "matches what our harness got as the API default". That
# premise was false. The flows arm has never taken an API default: `effortFor`
# in `packages/smithers/agent/src/AgentSession.ts` returns `high` whenever a flow
# declares no `effort:` frontmatter, `lib/write-flow.mjs` declares none, and
# both have been that way since before wave 1. So every flows wave ran at high
# while every codex lane ran at medium — 45 of 45 transcripts in both
# `fullbench/codex/logs/` and `fullbench/codex-sealed/logs/` carry
# `reasoning effort: medium` — and effort was a variable neither arm's number
# controlled for. Will ruled on 2026-08-23 that the prior results are
# effort-confounded and that the codex arm re-runs at the effort the arm it is
# compared against uses. Current comparisons default both arms to `max`;
# historical lanes continue to pin `high` or `medium`.
#
# A lane that reproduces an older measurement pins its own value instead;
# `codex-backfill.sh` pins one per lane for exactly that reason. The value is
# recorded in the run's timings, and codex echoes it in its own run-log header
# (`reasoning effort: <value>`), so a transcript proves what it ran at.

echo "[$RUN_ID] codex start ($MODEL, effort $EFFORT, ${BUDGET}s)"
START=$(date +%s)
CODE=0
python3 "$S/lib/run-with-timeout.py" "$BUDGET" "$SWB_CODEX_CLI" exec \
  -C "$WORK" \
  -m "$MODEL" \
  -c model_reasoning_effort="$EFFORT" \
  "${CODEX_ARGS[@]}" \
  --skip-git-repo-check \
  --json \
  --ephemeral \
  --color never \
  -o "$LOG_PREFIX.last-message.txt" \
  - < "$LOG_PREFIX.session-prompt.md" \
  > "$LOG_PREFIX.run.log" 2>&1 || CODE=$?
END=$(date +%s)
echo "[$RUN_ID] codex done in $((END-START))s (exit $CODE)"

# `network` is the seal on codex's own tools and `testbedNetwork` is the seal on
# the container those tools can reach through `docker exec`. They are separate
# conditions with separate holes, so a run records both — and records what
# `docker inspect` observed as well as what the lane asked for, because the
# scoreboard asserts on the observation.
printf '{\n  "instance_id": "%s",\n  "run_id": "%s",\n  "runIndex": "%s",\n  "model": "%s",\n  "codexAuth": "%s",\n  "account": "%s",\n  "codexVersion": "%s",\n  "budgetSeconds": %s,\n  "network": "%s",\n  "effort": "%s",\n  "testbedNetwork": "%s",\n  "testbedNetworkObserved": "%s",\n  "exitCode": %s,\n  "startedAt": %s,\n  "endedAt": %s,\n  "wallClockSeconds": %s\n}\n' \
  "$INSTANCE" "$RUN_ID" "$RUN_INDEX" "$MODEL" "$CODEX_AUTH" "$SWB_CODEX_ACCOUNT" "$SWB_CODEX_CLI_VERSION" "$BUDGET" "$NETWORK" "$EFFORT" \
  "$TESTBED_NETWORK" "$TESTBED_OBSERVED" "$CODE" "$((START*1000))" "$((END*1000))" "$((END-START))" \
  > "$TIMINGS"

if ! python3 "$S/lib/codex-seal.py" "$TIMINGS" "$LOG_PREFIX.run.log" "$CONTAINER" --guest-network "$TESTBED_OBSERVED"; then
  echo "[$RUN_ID] stock Codex seal or Docker verification is unproven; timings record sealed=false." >&2
  exit 125
fi

CAPTURE_STATUS=0
"$S/lib/capture-patch.sh" "$WORK" "$PATCH" \
  ':(exclude)AGENTS.md' >/dev/null || CAPTURE_STATUS=$?
if [ "$CAPTURE_STATUS" -eq 0 ] && [ ! -f "$PATCH" ]; then CAPTURE_STATUS=1; fi
if [ "$CAPTURE_STATUS" -ne 0 ]; then
  echo "[$RUN_ID] CAPTURE FAILED (exit $CAPTURE_STATUS); checkout retained at $WORK; patch $PATCH" >&2
  printf 'captureExitStatus=%s\nworkspace=%s\npatch=%s\n' \
    "$CAPTURE_STATUS" "$WORK" "$PATCH" > "$LOG_PREFIX.capture-failed" || true
  exit "$CAPTURE_STATUS"
fi
rm -f "$LOG_PREFIX.capture-failed"

# An empty patch is a valid no-edit result, but keep its checkout for inspection.
if [ -s "$PATCH" ]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
else
  echo "[$RUN_ID] empty patch; checkout retained at $WORK"
fi
echo "[$RUN_ID] patch bytes: $(wc -c < "$PATCH" | tr -d ' ')"
echo "[$RUN_ID] untracked files left out of the patch: $(wc -l < "$PATCH.untracked" | tr -d ' ')"
