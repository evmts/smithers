package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// codingReplyMessageLimit is .smithers/flows/coding/dispatch.ts TurnAnswer.messages'
// maximum length. Each message's text is bounded by the same number of UTF-16
// code units as codingTriggerTextLimit, which that file also declares.
const codingReplyMessageLimit = 20

// The typed refusals of a completed coding turn's reply. Their text is what
// operators grep for in the worker log ('refused completed coding turn reply').
var (
	errCodingRunIdentity  = errors.New("completed coding turn run identity is invalid")
	errCodingTurnIdentity = errors.New("completed coding turn output identity is invalid")
)

// completedCodingMessages decodes only coding/dispatch's final reply rows.
// Journal/tool frames are not replies. The reply must name the admitted
// turn; older hosts omitted ordinal, which is still optional.
func completedCodingMessages(update flowdispatch.ProjectionUpdate, projection agentFlowProjection) ([]string, error) {
	run := update.Checkpoint.Run
	if run == nil || run.FinalOutput == nil {
		return nil, errors.New("completed coding turn has no final output")
	}
	if run.Status != "completed" || run.FlowID != codingDispatchFlowID || run.RunID == "" || run.RunID != update.Checkpoint.RunID {
		return nil, errCodingRunIdentity
	}
	var output struct {
		TurnID   *string `json:"turnId"`
		Messages []struct {
			Ordinal *int   `json:"ordinal"`
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(*run.FinalOutput), &output); err != nil {
		return nil, fmt.Errorf("decode completed coding turn: %w", err)
	}
	// Two id namespaces meet here. run.RunID is the runtime launch id the
	// server started (dispatch:<op>), checked above against the checkpoint.
	// The output's runId is the host engine's own execution id for the flow
	// inside that launch (coding/dispatch.ts DispatchResult.runId, a handle
	// for the host gateway's selectors), so it never equals run.RunID and is
	// not compared (P0 2026-10-19, Security d-kq78n2). The server-assigned
	// turnId binds the answer to its turn, so it is required (Security
	// d-naxrhi; coding/dispatch's DispatchResult always carries it). Binding
	// the echoed runId to the launch's own journal is post-launch work
	// (option A).
	if output.TurnID == nil || *output.TurnID != fmt.Sprintf("run-%d", projection.WorkflowRunID) {
		return nil, errCodingTurnIdentity
	}
	if len(output.Messages) == 0 || len(output.Messages) > codingReplyMessageLimit {
		return nil, fmt.Errorf("completed coding turn needs 1 to %d assistant messages", codingReplyMessageLimit)
	}
	messages := make([]string, len(output.Messages))
	for i, message := range output.Messages {
		if message.Role != "assistant" || message.Content == "" || utf16Length(message.Content) > codingTriggerTextLimit || message.Ordinal != nil && *message.Ordinal != i {
			return nil, fmt.Errorf("completed coding turn message %d is invalid", i)
		}
		messages[i] = message.Content
	}
	return messages, nil
}

// completeCodingTurn uses the existing terminal transition as the exactly-once
// fence. Replies, parts and completion commit together under the session row
// lock; a failed write rolls everything back and a replay appends nothing.
// A non-nil result, observed before this transaction began, is the last
// reply's coding_result part: the only writer of that part.
func (service *AgentService) completeCodingTurn(ctx context.Context, update flowdispatch.ProjectionUpdate, terminal db.UpdateAgentSessionTerminalStatusForFlowParams, messages []string, result *CodingResult) (db.AgentSession, []AgentMessageResponse, error) {
	beginner, ok := service.dispatchQ.(workflowQueryTxStarter)
	if !ok {
		return db.AgentSession{}, nil, errors.New("coding completion transactions unavailable")
	}
	tx, err := beginner.BeginTx(ctx)
	if err != nil {
		return db.AgentSession{}, nil, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	q := db.New(tx)
	session, err := q.UpdateAgentSessionTerminalStatusForFlow(ctx, terminal)
	if err != nil {
		return db.AgentSession{}, nil, err
	}
	if update.Scope != agentFlowScope(session.RepositoryID, session.UserID) {
		return db.AgentSession{}, nil, errors.New("coding completion scope does not own the session")
	}
	responses := make([]AgentMessageResponse, 0, len(messages))
	for i, text := range messages {
		message, err := q.CreateAgentMessageWithNextSequence(ctx, db.CreateAgentMessageWithNextSequenceParams{SessionID: session.ID, Role: "assistant"})
		if err != nil {
			return db.AgentSession{}, nil, err
		}
		content, _ := json.Marshal(map[string]string{"value": text})
		part, err := q.CreateAgentPart(ctx, db.CreateAgentPartParams{MessageID: message.ID, RepositoryID: session.RepositoryID, SessionID: session.ID, PartIndex: 0, PartType: "text", Content: content})
		if err != nil {
			return db.AgentSession{}, nil, err
		}
		response := AgentMessageResponse{ID: message.ID, SessionID: session.ID, Role: message.Role, Sequence: message.Sequence, CreatedAt: message.CreatedAt, Parts: []AgentPartResponse{{PartIndex: part.PartIndex, Type: part.PartType, Content: part.Content}}}
		if result != nil && i == len(messages)-1 {
			part, err := q.CreateAgentPart(ctx, db.CreateAgentPartParams{MessageID: message.ID, RepositoryID: session.RepositoryID, SessionID: session.ID, PartIndex: 1, PartType: "coding_result", Content: codingResultPartContent(*result)})
			if err != nil {
				return db.AgentSession{}, nil, err
			}
			response.Parts = append(response.Parts, AgentPartResponse{PartIndex: part.PartIndex, Type: part.PartType, Content: part.Content})
		}
		responses = append(responses, response)
	}
	if err := tx.Commit(ctx); err != nil {
		return db.AgentSession{}, nil, err
	}
	return session, responses, nil
}
