package services

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// ErrNoCodingResult means no assistant reply in this repository session carries a coding result.
var ErrNoCodingResult = errors.New("no coding result")

// CodingResult is the host's durable receipt for one completed coding turn.
type CodingResult struct {
	Producer     string             `json:"producer"`
	ReplyID      int64              `json:"-"`
	HeadCommit   *string            `json:"head_commit"`
	HeadChangeID *string            `json:"head_change_id"`
	TestReceipt  *CodingTestReceipt `json:"test_receipt"`
}

// CodingTestReceipt records the command executed by the host at an immutable commit.
type CodingTestReceipt struct {
	Command    string `json:"command"`
	ExitCode   int    `json:"exit_code"`
	Commit     string `json:"commit"`
	FinishedAt string `json:"finished_at"`
	OutputTail string `json:"output_tail"`
	TestsRun   *int   `json:"tests_run"`
}

// Tested reports whether the receipt belongs to the turn's head.
func (r CodingResult) Tested() bool {
	return r.HeadCommit != nil && r.TestReceipt != nil && r.TestReceipt.Commit == *r.HeadCommit
}

// Passed never treats a command that executed zero tests as passing.
func (r CodingResult) Passed() bool {
	return r.Tested() && r.TestReceipt.ExitCode == 0 && (r.TestReceipt.TestsRun == nil || *r.TestReceipt.TestsRun != 0)
}

// LatestCodingResult reads the newest assistant reply with a coding_result,
// or the requested reply. Repository and session ownership are checked before
// reading parts; ordinary replies after a result do not hide it.
func (s *AgentService) LatestCodingResult(ctx context.Context, repositoryID int64, sessionID string, replyID *int64) (CodingResult, error) {
	return s.readCodingResult(ctx, repositoryID, sessionID, func(id int64) bool { return replyID == nil || id == *replyID })
}

func (s *AgentService) readCodingResult(ctx context.Context, repositoryID int64, sessionID string, accept func(int64) bool) (CodingResult, error) {
	parsedID, err := uuid.Parse(sessionID)
	if err != nil {
		return CodingResult{}, ErrNoCodingResult
	}
	sessionID = parsedID.String()
	session, err := s.q.GetAgentSession(ctx, sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return CodingResult{}, ErrNoCodingResult
	}
	if err != nil {
		return CodingResult{}, err
	}
	if session.RepositoryID != repositoryID {
		return CodingResult{}, ErrNoCodingResult
	}
	var latest CodingResult
	found := false
	for offset := int32(0); ; offset += 100 {
		messages, err := s.q.ListAgentMessages(ctx, db.ListAgentMessagesParams{SessionID: sessionID, PageOffset: offset, PageSize: 100})
		if err != nil {
			return CodingResult{}, err
		}
		for _, message := range messages {
			if message.Role != "assistant" || !accept(message.ID) {
				continue
			}
			parts, err := s.q.ListAgentMessageParts(ctx, message.ID)
			if err != nil {
				return CodingResult{}, err
			}
			for _, part := range parts {
				if part.PartType != "coding_result" {
					continue
				}
				var result CodingResult
				if err := json.Unmarshal(part.Content, &result); err != nil {
					return CodingResult{}, err
				}
				if result.Producer != "smithers-server" {
					continue
				}
				result.ReplyID = message.ID
				latest, found = result, true
			}
		}
		if len(messages) < 100 {
			break
		}
	}
	if !found {
		return CodingResult{}, ErrNoCodingResult
	}
	return latest, nil
}
