package chat

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type queuedPrompt struct {
	ID     string `json:"id"`
	RunID  string `json:"runId"`
	LegID  string `json:"legId"`
	Prompt string `json:"prompt"`
	Cursor Cursor `json:"cursor"`
}

// privatePromptQueue verifies only the authenticated author's unstarted turns.
// Hosted account views exclude historical private admission rows.
func (s *Store) privatePromptQueue(ctx context.Context, tx pgx.Tx, repositoryID, userID int64, conversation string) ([]queuedPrompt, error) {
	rows, err := tx.Query(ctx, `SELECT `+turnColumns+` FROM chat_turns WHERE repository_id=$1 AND user_id=$2 AND conversation_id=$3 AND state='queued' AND NOT terminal AND (repository_id>0 OR request_payload->>'privateConversation'='true') ORDER BY created_at,id`, repositoryID, userID, conversation)
	if err != nil {
		return nil, err
	}
	queue := []queuedPrompt{}
	for rows.Next() {
		turn, scanErr := scanTurn(rows)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		_, cursor, checkErr := checkHead(turn)
		if checkErr != nil {
			rows.Close()
			return nil, checkErr
		}
		_, prompt, metadataErr := conversationMetadata(turn)
		if metadataErr != nil {
			rows.Close()
			return nil, metadataErr
		}
		queue = append(queue, queuedPrompt{ID: turn.ID, RunID: turn.RunID, LegID: turn.LegID, Prompt: prompt, Cursor: cursor})
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return queue, nil
}
