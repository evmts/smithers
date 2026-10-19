package services

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// CodingTurnExec is what one coding_result exec observed in a box.
type CodingTurnExec struct {
	// At is the box's working-copy commit when it is not the head.
	At string
	// Refusal says why the test did not run or did not finish: "tree
	// missing", "tree dirty", "tree unread" (a read failed), "timeout" or
	// "lost" (no exit status).
	Refusal  string
	ExitCode int
	// Tail is the last 8 KiB of the test's combined output, unmasked.
	Tail []byte
	// Truncated says the output was longer than Tail.
	Truncated bool
}

// codingTurnTestScript runs in the box as the runtime's guest account (on
// hosted, plue's workspace runtime wraps every command in runuser -u
// developer). It refuses to run the test unless the working tree is exactly
// head: jj snapshots first so a lagging head reporter is visible, then git
// compares the files with head through a private index. Repository config
// cannot hook either read, and a read that fails refuses, never passes. The test runs under env -i with only HOME and
// PATH, a hard timeout and no input. Its output streams through tail, which
// keeps only the last 8 KiB while it runs, so a flood never fills the disk;
// its exit status returns through a descriptor the test does not hold, never
// a file. timeout leads the test's process group; once the test exits, what
// it left in that group is killed so the output stream ends. Only the script
// writes stdout. Arguments: head, timeout seconds, then the test argv.
const codingTurnTestScript = `set -u
head=$1 limit=$2
shift 2
say() { printf 'smithers-coding-test %s\n' "$*"; }
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_OPTIONAL_LOCKS=0
at=$(jj --no-pager --config fsmonitor.backend=none log --no-graph -r @ -T commit_id 2>/dev/null) || at=""
if [ -n "$at" ] && [ "$at" != "$head" ]; then say at "$at"; exit 0; fi
work=$(mktemp -d) || exit 70
trap 'rm -rf -- "$work"' EXIT
g() { GIT_INDEX_FILE="$work/index" git -c safe.directory="$PWD" -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.untrackedCache=false -c core.alternateRefsCommand= "$@"; }
if ! g cat-file -e "$head^{commit}" 2>/dev/null || ! g read-tree "$head" 2>/dev/null; then say tree missing; exit 0; fi
g update-index -q --refresh >/dev/null 2>&1
g diff-files --quiet >/dev/null 2>&1
case $? in 0) ;; 1) say tree dirty; exit 0 ;; *) say tree unread; exit 0 ;; esac
if ! g ls-files --others --exclude-standard >"$work/untracked" 2>/dev/null; then say tree unread; exit 0; fi
if [ -s "$work/untracked" ]; then say tree dirty; exit 0; fi
start=$(date +%s)
code=$( { { timeout -k 10 "$limit" env -i HOME="$HOME" PATH="$PATH" "$@" </dev/null 2>&1 4>&- & pid=$!; wait "$pid"; status=$?; kill -KILL -"$pid" 2>/dev/null; echo "$status" >&4; } | tail -c 8193 >"$work/out" 4>&-; } 4>&1 )
if [ $(($(date +%s) - start)) -ge "$limit" ]; then say timeout; exit 0; fi
case $code in ''|*[!0-9]*) say lost; exit 0 ;; esac
truncated=0
if [ "$(wc -c <"$work/out")" -gt 8192 ]; then truncated=1; fi
printf 'smithers-coding-test exit %d %d ' "$code" "$truncated"
tail -c 8192 "$work/out" | base64 | tr -d '\n'
printf '\n'
`

// codingTurnTestCommand is the runtime command for one coding_result exec.
// It carries no environment: the runtime's own guest environment is the only
// input besides head and the declared argv.
func codingTurnTestCommand(head string, timeout time.Duration, argv []string) workspaceapi.Command {
	args := []string{"/bin/sh", "-c", codingTurnTestScript, "smithers-coding-test", head, strconv.Itoa(int(timeout / time.Second))}
	return workspaceapi.Command{Args: append(args, argv...)}
}

// errCodingTurnOfflineUnavailable refuses a runtime that cannot run a
// command in the guest with no network, no other process and no credential
// cache in view (workspaceapi.WorkspaceOfflineCommandRunner).
var errCodingTurnOfflineUnavailable = errors.New("the workspace runtime cannot run a command offline")

// errCodingTurnGuestChanged refuses a test on a guest other than the one the
// observation began with: a late observation never reaches a newer guest of
// the same reusable workspace.
var errCodingTurnGuestChanged = errors.New("the box's guest changed since the turn ended")

// CodingTurnGuest is the guest (the runtime placement) a running agent box
// holds now; an observation captures it before any other read.
func (s *WorkspaceService) CodingTurnGuest(ctx context.Context, workspaceID string) (string, error) {
	if s == nil || s.q == nil {
		return "", errors.New("workspace store unavailable")
	}
	row, err := s.q.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return "", err
	}
	if row.Status != "running" || strings.TrimSpace(row.VmID) == "" {
		return "", fmt.Errorf("the box is %s with no running guest", row.Status)
	}
	return row.VmID, nil
}

// RunCodingTurnTest runs argv in the agent's box at head through the
// isolated workspace runtime's offline runner (the controller and worker exec
// on hosted): as the developer account, with no network, no other process
// and no credential cache in view. It never runs on the API host and never as
// root, and only on guest: the box must still run the guest the observation
// captured, which the runtime also checks (WithGuest).
func (s *WorkspaceService) RunCodingTurnTest(ctx context.Context, workspaceID, guest, head string, argv []string) (CodingTurnExec, error) {
	if s == nil || s.q == nil || s.runtime == nil || s.runtime.Isolation() != workspaceapi.IsolationSandboxed {
		return CodingTurnExec{}, errCodingTurnOfflineUnavailable
	}
	offline, ok := s.runtime.(workspaceapi.WorkspaceOfflineCommandRunner)
	if !ok {
		return CodingTurnExec{}, errCodingTurnOfflineUnavailable
	}
	if !codingCommitID.MatchString(head) || len(argv) == 0 || guest == "" {
		return CodingTurnExec{}, errors.New("a coding test needs a guest, a full head commit and a command")
	}
	row, err := s.q.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return CodingTurnExec{}, err
	}
	if row.Status != "running" || row.VmID != guest {
		return CodingTurnExec{}, errCodingTurnGuestChanged
	}
	if err := guardWorkspaceRuntimeEffect(ctx); err != nil {
		return CodingTurnExec{}, err
	}
	operationCtx, err := s.workspaceRuntimeContext(ctx, row, row.UserID, workspaceLifecycleOperation(row, "coding-result-"+uuid.NewString()))
	if err != nil {
		return CodingTurnExec{}, err
	}
	execCtx, cancel := context.WithTimeout(operationCtx, codingTurnTestTimeout+time.Minute)
	defer cancel()
	result, err := offline.RunOfflineAsDeveloper(workspaceapi.WithGuest(execCtx, guest), row.ID, codingTurnTestCommand(head, codingTurnTestTimeout, argv))
	if errors.Is(err, workspaceapi.ErrGuestGone) {
		return CodingTurnExec{}, errCodingTurnGuestChanged
	}
	if err != nil {
		return CodingTurnExec{}, err
	}
	return parseCodingTurnExec(result)
}

// parseCodingTurnExec reads the script's one result line. The test's own
// output never reaches stdout, so it cannot write that line.
func parseCodingTurnExec(result workspaceapi.CommandResult) (CodingTurnExec, error) {
	if result.OutputTruncated || result.ExitCode != 0 {
		return CodingTurnExec{}, fmt.Errorf("coding test exec failed with status %d", result.ExitCode)
	}
	lines := strings.Split(strings.TrimRight(result.Stdout, "\n"), "\n")
	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 2 || fields[0] != "smithers-coding-test" {
		return CodingTurnExec{}, errors.New("coding test exec reported no result")
	}
	switch {
	case fields[1] == "at" && len(fields) == 3 && codingCommitID.MatchString(fields[2]):
		return CodingTurnExec{At: fields[2]}, nil
	case fields[1] == "tree" && len(fields) == 3 && (fields[2] == "missing" || fields[2] == "dirty" || fields[2] == "unread"):
		return CodingTurnExec{Refusal: "tree " + fields[2]}, nil
	case (fields[1] == "timeout" || fields[1] == "lost") && len(fields) == 2:
		return CodingTurnExec{Refusal: fields[1]}, nil
	case fields[1] == "exit" && (len(fields) == 4 || len(fields) == 5) && (fields[3] == "0" || fields[3] == "1"):
		code, err := strconv.Atoi(fields[2])
		if err != nil || code < 0 || code > 255 {
			return CodingTurnExec{}, errors.New("coding test exec reported an invalid exit code")
		}
		var tail []byte
		if len(fields) == 5 {
			if tail, err = base64.StdEncoding.DecodeString(fields[4]); err != nil || len(tail) > 8192 {
				return CodingTurnExec{}, errors.New("coding test exec reported an invalid output tail")
			}
		}
		return CodingTurnExec{ExitCode: code, Tail: tail, Truncated: fields[3] == "1"}, nil
	}
	return CodingTurnExec{}, errors.New("coding test exec reported no result")
}
