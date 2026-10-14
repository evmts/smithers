package services

import (
	"encoding/json"
	"errors"
	"strings"

	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// agentSessionFailureReasonKey is the single metadata key a failed session
// carries. The API returns agent_sessions.metadata verbatim, so this key is
// part of the session's public shape: one sentence, product vocabulary, no
// provider error chain.
const agentSessionFailureReasonKey = "failure_reason"

// agentSessionNoCapacityMessage is what a session says when the agent pool had
// no room for its box. It mirrors workspaceNoCapacityMessage: it names the
// cause, promises nothing ran, and gives the one action that helps.
const agentSessionNoCapacityMessage = "The agent pool is full right now. Nothing ran; start the agent again in a moment."

// agentSessionMachineStartingMessage is what a session says when the branch's
// machine is already being started by another request. Like a full pool, the
// action that helps is to wait, not to retry at once — and unlike a failure,
// the machine this turn needs is on its way (#3886).
const agentSessionMachineStartingMessage = "The branch's machine is still starting. Nothing ran; start the agent again once it is awake."

// agentSessionMachineMissingMessage is what a session says when the branch's
// machine no longer exists. Unlike a full pool or a machine that is still
// starting, waiting changes nothing and retrying changes nothing: the box is
// gone and only a fresh one can run the turn, so this sentence must not borrow
// agentSessionStartFailureMessage's "try again in a moment".
const agentSessionMachineMissingMessage = "The branch's machine no longer exists. Nothing ran; create the box again, and retrying this turn will not bring it back."

// agentSessionSnapshotMissingMessage is what a session says when the branch's
// machine cannot be restored because its snapshot is no longer available.
// Like a machine that no longer exists, neither waiting nor retrying changes
// it: the restore is terminal (it marks the row provision-failed), so this
// sentence must not borrow agentSessionStartFailureMessage's "try again in a
// moment" either.
const agentSessionSnapshotMissingMessage = "The branch's machine cannot be restored: its snapshot is no longer available. Nothing ran; create the box again, and retrying this turn will not restore it."

// agentSessionBranchMachineFailedMessage is what a session says when the
// branch's machine is retained after a failed provision. GetBranchWorkspace
// returns such a row on purpose and "none permit replacement", so the join
// branchMachineCompatible refuses is refused for as long as the row exists:
// waiting changes nothing, retrying changes nothing, and there is no second
// machine to create instead. Like the two losses above, this sentence must not
// borrow agentSessionStartFailureMessage's "try again in a moment".
const agentSessionBranchMachineFailedMessage = "The branch's machine is retained after a failed provision and can no longer be joined. Nothing ran; this branch needs its machine recovered, and retrying this turn will not recover it."

// agentSessionStartFailureMessage is the fallback for every other reason a
// dispatch could not start. The specific cause stays in the operator log and
// the run's last_error; the owner of the session gets a true sentence instead
// of an empty metadata object.
const agentSessionStartFailureMessage = "The agent could not be started. Nothing ran; try again in a moment."

// agentSessionLoopRetiredMessage is what a session says on a deployment where
// cloud agent dispatch is not wired at all. Retrying never helps, so it must
// not borrow agentSessionStartFailureMessage's "try again in a moment": the
// refusal is permanent until a Smithers 1.0 entrypoint exists. The operator
// detail (agentLoopRetiredMessage) stays in the log.
const agentSessionLoopRetiredMessage = "Cloud agents are not available on this deployment yet. Nothing ran, and retrying will not help."

// agentSessionFailureReasonForError classifies a dispatch failure into the one
// sentence the session shows. The distinguished causes are the ones a user acts
// on differently: a pool with no room and a branch machine another request is
// already starting are both worth waiting for, and the three permanent losses
// — a machine that no longer exists, a snapshot the provider can no longer
// restore, and a machine the branch retains after a failed provision — are
// worth neither waiting nor retrying. Everything else is the fallback, with
// its cause in the operator log.
func agentSessionFailureReasonForError(err error) string {
	if isNoCapacityError(err) {
		return agentSessionNoCapacityMessage
	}
	if errors.Is(err, errWorkspaceProvisionInProgress) {
		return agentSessionMachineStartingMessage
	}
	if errors.Is(err, errBranchMachineRetainedFailure) {
		return agentSessionBranchMachineFailedMessage
	}
	var apiErr *pkgerrors.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Code {
		case pkgerrors.CodeWorkspaceVMMissing:
			return agentSessionMachineMissingMessage
		case pkgerrors.CodeSnapshotNotFound:
			return agentSessionSnapshotMissingMessage
		}
	}
	return agentSessionStartFailureMessage
}

// agentSessionFailureReasonFromMetadata reads the recorded sentence back out of
// a session row so the status event can repeat it without a second query.
// Anything other than a non-empty string reads as absent.
func agentSessionFailureReasonFromMetadata(metadata json.RawMessage) string {
	if len(metadata) == 0 {
		return ""
	}
	var parsed map[string]any
	if err := json.Unmarshal(metadata, &parsed); err != nil {
		return ""
	}
	reason, ok := parsed[agentSessionFailureReasonKey].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(reason)
}
