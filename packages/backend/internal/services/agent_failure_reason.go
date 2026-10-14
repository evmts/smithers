package services

import (
	"encoding/json"
	"strings"
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

// agentSessionStartFailureMessage is the fallback for every other reason a
// dispatch could not start. The specific cause stays in the operator log and
// the run's last_error; the owner of the session gets a true sentence instead
// of an empty metadata object.
const agentSessionStartFailureMessage = "The agent could not be started. Nothing ran; try again in a moment."

// agentSessionFailureReasonForError classifies a dispatch failure into the one
// sentence the session shows. A pool with no room is the one cause a user can
// act on differently (wait, rather than retry at once), which is why it is the
// only distinguished case.
func agentSessionFailureReasonForError(err error) string {
	if isNoCapacityError(err) {
		return agentSessionNoCapacityMessage
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
