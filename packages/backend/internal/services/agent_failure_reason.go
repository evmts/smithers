package services

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	workspaceapi "github.com/smithersai/smithers/packages/backend/workspace"
)

// agentSessionFailure is the typed reason a failed session carries. The
// session read returns it as reason_code, reason and retryable, and the
// failure ends the turn with one assistant reply holding the same sentence.
type agentSessionFailure = db.AgentSessionFailure

// The closed vocabulary of reason_code. A failure that names no cause of its
// own uses the code of the stage it failed in; nothing outside this list is
// ever written. retryable is true when trying again can succeed without a code
// or configuration change.
const (
	// The packaged coding Flow host is larger than the sandbox can stage.
	agentFailureFlowHostTooLarge = "flow_host_too_large"
	// The coding Flow host did not start or answer in the box.
	agentFailureFlowHostUnavailable = "flow_host_unavailable"
	// The agent pool had no room for the box.
	agentFailureBoxUnavailable = "box_unavailable"
	// The branch's box is already being started by another request.
	agentFailureBoxStarting = "box_starting"
	// The box did not finish setting itself up in time.
	agentFailureBoxBootstrapTimeout = "box_bootstrap_timeout"
	// The box, or the snapshot it boots from, no longer exists.
	agentFailureBoxMissing = "box_missing"
	// The branch retains a box whose provision failed.
	agentFailureBoxFailed = "box_failed"
	// The branch's box is stopped and must be started first.
	agentFailureBoxStopped = "box_stopped"
	// The model refused or did not answer the turn.
	agentFailureModelUnavailable = "model_unavailable"
	// The model is rate limited or over its quota.
	agentFailureModelRateLimited = "model_rate_limited"
	// The account has no model credit left.
	agentFailureOutOfCredit = "out_of_credit"
	// The turn ran and failed before it answered.
	agentFailureTurnFailed = "turn_failed"
	// The turn ran past its time limit.
	agentFailureTurnTimedOut = "turn_timed_out"
	// The workspace service was too busy starting other boxes to start this
	// turn's box in time.
	agentFailureBoxBusy = "box_busy"
	// The dispatch failed for any other reason before the turn ran.
	agentFailureDispatchFailed = "dispatch_failed"
	// This deployment runs no cloud agents.
	agentFailureAgentsUnavailable = "agents_unavailable"
	// This deployment runs hosted coding only for the users its operator
	// lists (agents.hosted_coding_user_ids), and the session's user is not
	// one of them.
	agentFailureHostedCodingNotOpen = "hosted_coding_not_open"
)

// agentSessionFailureCodes is the whole vocabulary, in the order above.
var agentSessionFailureCodes = []string{
	agentFailureFlowHostTooLarge, agentFailureFlowHostUnavailable,
	agentFailureBoxUnavailable, agentFailureBoxStarting, agentFailureBoxBootstrapTimeout,
	agentFailureBoxMissing, agentFailureBoxFailed, agentFailureBoxStopped,
	agentFailureModelUnavailable, agentFailureModelRateLimited, agentFailureOutOfCredit,
	agentFailureTurnFailed, agentFailureTurnTimedOut, agentFailureBoxBusy,
	agentFailureDispatchFailed, agentFailureAgentsUnavailable, agentFailureHostedCodingNotOpen,
}

// The metadata keys a failed session carries. The API returns
// agent_sessions.metadata verbatim, so they are part of the session's public
// shape: one sentence, product vocabulary, no provider error chain.
const (
	agentSessionFailureReasonKey    = "failure_reason"
	agentSessionFailureCodeKey      = "failure_reason_code"
	agentSessionFailureRetryableKey = "failure_retryable"
)

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

// agentSessionBranchMachineStoppedMessage is what a session says when the
// branch's machine is retained while stopped. It is the one retained machine
// its owner can undo: branchMachineCompatible refuses the join for as long as
// the row is stopped, so the dispatch never reaches the wake that would have
// started it, but starting the machine makes the next turn join. Waiting and
// retrying the turn alone change nothing, so this sentence names the start
// rather than borrowing agentSessionStartFailureMessage's "try again in a
// moment".
const agentSessionBranchMachineStoppedMessage = "The branch's machine is stopped. Nothing ran; start the machine, then run the turn again, and retrying this turn alone will not start it."

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

// hostedCodingNotOpenMessage is what a user the hosted coding allowlist does
// not name reads, on the API refusal and on the session. Retrying does not
// help: only the operator opens the gate.
const hostedCodingNotOpenMessage = "Hosted coding isn't open for your account yet"

// The failures a dispatch distinguishes before its turn runs. Each pairs the
// sentence above with its code and whether a retry alone can succeed.
var (
	agentSessionNoCapacity           = agentSessionFailure{Code: agentFailureBoxUnavailable, Reason: agentSessionNoCapacityMessage, Retryable: true}
	agentSessionMachineStarting      = agentSessionFailure{Code: agentFailureBoxStarting, Reason: agentSessionMachineStartingMessage, Retryable: true}
	agentSessionMachineMissing       = agentSessionFailure{Code: agentFailureBoxMissing, Reason: agentSessionMachineMissingMessage}
	agentSessionSnapshotMissing      = agentSessionFailure{Code: agentFailureBoxMissing, Reason: agentSessionSnapshotMissingMessage}
	agentSessionBranchMachineFailed  = agentSessionFailure{Code: agentFailureBoxFailed, Reason: agentSessionBranchMachineFailedMessage}
	agentSessionBranchMachineStopped = agentSessionFailure{Code: agentFailureBoxStopped, Reason: agentSessionBranchMachineStoppedMessage}
	agentSessionBoxNotReady          = agentSessionFailure{Code: agentFailureBoxBootstrapTimeout, Reason: "The box did not finish starting in time. Nothing ran; try again in a moment.", Retryable: true}
	agentSessionStartFailure         = agentSessionFailure{Code: agentFailureDispatchFailed, Reason: agentSessionStartFailureMessage, Retryable: true}
	agentSessionNeverStarted         = agentSessionFailure{Code: agentFailureDispatchFailed, Reason: "The agent never started. Nothing ran; try again.", Retryable: true}
	agentSessionLoopRetired          = agentSessionFailure{Code: agentFailureAgentsUnavailable, Reason: agentSessionLoopRetiredMessage}
	agentSessionHostedCodingNotOpen  = agentSessionFailure{Code: agentFailureHostedCodingNotOpen, Reason: hostedCodingNotOpenMessage}
	agentSessionOutOfCredit          = agentSessionFailure{Code: agentFailureOutOfCredit, Reason: "This account is out of model credit. Add credit, then try again."}
)

// The failures of a turn the Flow runtime admitted.
var (
	agentSessionFlowHostTooLarge    = agentSessionFailure{Code: agentFailureFlowHostTooLarge, Reason: "The coding host exceeds the sandbox staging limit. Nothing ran, and trying again will not help."}
	agentSessionFlowHostUnavailable = agentSessionFailure{Code: agentFailureFlowHostUnavailable, Reason: "The coding host did not start in the box. Nothing ran; try again in a moment.", Retryable: true}
	agentSessionModelBusy           = agentSessionFailure{Code: agentFailureModelUnavailable, Reason: "The model did not answer. Try again in a moment.", Retryable: true}
	agentSessionModelUnrouted       = agentSessionFailure{Code: agentFailureModelUnavailable, Reason: "The model is not available on this deployment. Trying again will not help."}
	agentSessionModelRateLimited    = agentSessionFailure{Code: agentFailureModelRateLimited, Reason: "The model is rate limited right now. Try again in a moment.", Retryable: true}
	agentSessionTurnFailed          = agentSessionFailure{Code: agentFailureTurnFailed, Reason: "The agent stopped before it finished this turn. Try again.", Retryable: true}
	agentSessionTurnTimedOut        = agentSessionFailure{Code: agentFailureTurnTimedOut, Reason: "The turn ran past its time limit and was stopped. Try again.", Retryable: true}
	agentSessionBoxBusy             = agentSessionFailure{Code: agentFailureBoxBusy, Reason: "The workspace service is busy starting other boxes; try again in a moment.", Retryable: true}
)

// agentSessionFailureForError classifies a dispatch failure into the reason
// the session shows. The distinguished causes are the ones a user acts on
// differently: a pool with no room, a service busy starting other boxes and a
// branch machine another request is already starting are all worth waiting
// for; the three permanent losses (a
// machine that no longer exists, a snapshot the provider can no longer
// restore, and a machine the branch retains after a failed provision) are
// worth neither waiting nor retrying; and a machine the branch retains while
// stopped is worth starting. Everything else is the fallback, with its cause
// in the operator log.
func agentSessionFailureForError(err error) agentSessionFailure {
	if isNoCapacityError(err) {
		return agentSessionNoCapacity
	}
	if errors.Is(err, errWorkspaceProvisionInProgress) {
		return agentSessionMachineStarting
	}
	if errors.Is(err, errBranchMachineRetainedFailure) {
		return agentSessionBranchMachineFailed
	}
	if errors.Is(err, errBranchMachineStopped) {
		return agentSessionBranchMachineStopped
	}
	if isWorkspaceMutationBusy(err) {
		return agentSessionBoxBusy
	}
	var apiErr *pkgerrors.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Code {
		case pkgerrors.CodeWorkspaceVMMissing:
			return agentSessionMachineMissing
		case pkgerrors.CodeSnapshotNotFound:
			return agentSessionSnapshotMissing
		case pkgerrors.CodeGuestNotReady:
			return agentSessionBoxNotReady
		case pkgerrors.CodeOutOfCredit:
			return agentSessionOutOfCredit
		}
	}
	return agentSessionStartFailure
}

// agentSessionFailureForFlow classifies an admitted turn that the Flow runtime
// failed. A run that failed in the host names the model or the turn; a bridge
// refusal (the box or its host never ran the turn) names the stage. The one
// detail it repeats is product copy a typed error wrote, never provider prose.
func agentSessionFailureForFlow(checkpoint flowdispatch.RuntimeCheckpoint) agentSessionFailure {
	if run := checkpoint.Run; run != nil && run.Status == "failed" {
		tag := run.FailureTag
		if modelCode, ok := strings.CutPrefix(tag, "flows/model/ModelError/"); ok {
			switch modelCode {
			case "rate_limited", "quota_exceeded":
				return agentSessionModelRateLimited
			case "out_of_credit":
				return agentSessionOutOfCredit
			case "no_route", "authentication":
				return agentSessionModelUnrouted
			case "invalid_request", "context_overflow", "content_policy":
				return agentSessionTurnFailed
			default:
				return agentSessionModelBusy
			}
		}
		if tag == "flows/agent/Timeout" {
			return agentSessionTurnTimedOut
		}
		return agentSessionTurnFailed
	}
	switch code := checkpoint.FailureCode; {
	case code == "":
		return agentSessionTurnFailed
	case code == workspaceapi.ManagedHostTooLargeCode:
		failure := agentSessionFlowHostTooLarge
		if detail := strings.TrimSpace(checkpoint.FailureDetail); detail != "" {
			failure.Reason = detail + " Nothing ran, and trying again will not help."
		}
		return failure
	case code == flowhost.WorkspaceInitializingCode || code == "wake_timeout" || code == string(pkgerrors.CodeGuestNotReady):
		return agentSessionBoxNotReady
	case code == "isolation_required" || code == "host_lease_lost" || code == "http_refused" || code == "health_refused" ||
		strings.HasPrefix(code, "runtime_"):
		return agentSessionFlowHostUnavailable
	default:
		return agentSessionStartFailure
	}
}

// agentSessionFailureFromMetadata reads the recorded reason back out of a
// session row so the session read and its status event can repeat it without
// a second query. A row without a recorded sentence reads as no failure; a
// legacy row with a sentence but no code reads as the fallback code.
func agentSessionFailureFromMetadata(metadata json.RawMessage) (agentSessionFailure, bool) {
	if len(metadata) == 0 {
		return agentSessionFailure{}, false
	}
	var parsed map[string]any
	if err := json.Unmarshal(metadata, &parsed); err != nil {
		return agentSessionFailure{}, false
	}
	reason, _ := parsed[agentSessionFailureReasonKey].(string)
	reason = strings.TrimSpace(reason)
	code, _ := parsed[agentSessionFailureCodeKey].(string)
	code = strings.TrimSpace(code)
	retryable, _ := parsed[agentSessionFailureRetryableKey].(bool)
	if reason == "" {
		return agentSessionFailure{}, false
	}
	if code == "" {
		code = agentFailureDispatchFailed
	}
	return agentSessionFailure{Code: code, Reason: reason, Retryable: retryable}, true
}

// agentSessionFailureReasonFromMetadata is the recorded sentence alone.
func agentSessionFailureReasonFromMetadata(metadata json.RawMessage) string {
	failure, _ := agentSessionFailureFromMetadata(metadata)
	return failure.Reason
}
