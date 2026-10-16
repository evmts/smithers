package chat

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// TurnInspection contains operator-only execution metadata. It deliberately
// omits prompts, answers, frame bodies, grants, tokens and credential hashes.
// This snapshot is diagnostic metadata, not a journal integrity receipt.
type TurnInspection struct {
	TurnID            string        `json:"turn_id"`
	ConversationID    *string       `json:"conversation_id"`
	UserID            int64         `json:"user_id"`
	RepositoryID      int64         `json:"repository_id"`
	RunID             string        `json:"run_id"`
	LegID             string        `json:"leg_id"`
	State             State         `json:"state"`
	Terminal          bool          `json:"terminal"`
	Generation        int64         `json:"generation"`
	ProviderStartedAt *time.Time    `json:"provider_started_at"`
	LeaseExpiresAt    *time.Time    `json:"lease_expires_at"`
	CancelRequestedAt *time.Time    `json:"cancel_requested_at"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
	HeadBatch         int64         `json:"head_batch"`
	HeadPosition      int64         `json:"head_position"`
	OutputBytes       int64         `json:"output_bytes"`
	LastBatchAt       *time.Time    `json:"last_batch_at"`
	Frames            []FrameCounts `json:"frames"`
}

// FrameCounts groups only allowlisted protocol labels and byte counts.
type FrameCounts struct {
	Type      string `json:"type"`
	Kind      string `json:"kind"`
	Phase     string `json:"phase"`
	Count     int64  `json:"count"`
	TextBytes int64  `json:"text_bytes"`
}

// InspectTurn reads one turn in a consistent read-only transaction. The caller
// must hold operator authority; this method is not exposed on an HTTP route.
func (s *Store) InspectTurn(ctx context.Context, turnID string) (TurnInspection, error) {
	if _, err := uuid.Parse(turnID); err != nil {
		return TurnInspection{}, ErrInvalidRequest
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return TurnInspection{}, err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	var out TurnInspection
	err = tx.QueryRow(ctx, `SELECT id,conversation_id,user_id,repository_id,run_id,leg_id,state,terminal,
		producer_generation,producer_started_at,producer_lease_expires_at,cancel_requested_at,
		created_at,updated_at,head_batch,head_position,output_bytes,
		(SELECT max(created_at) FROM chat_turn_batches WHERE turn_id=$1)
		FROM chat_turns WHERE id=$1`, turnID).Scan(&out.TurnID, &out.ConversationID, &out.UserID, &out.RepositoryID,
		&out.RunID, &out.LegID, &out.State, &out.Terminal, &out.Generation, &out.ProviderStartedAt,
		&out.LeaseExpiresAt, &out.CancelRequestedAt, &out.CreatedAt, &out.UpdatedAt, &out.HeadBatch,
		&out.HeadPosition, &out.OutputBytes, &out.LastBatchAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return TurnInspection{}, ErrNotFound
	}
	if err != nil {
		return TurnInspection{}, err
	}
	rows, err := tx.Query(ctx, `SELECT
		CASE WHEN f->>'type' IN ('delta','done','card','activity','context.preflight') THEN f->>'type' ELSE 'other' END AS type,
		CASE WHEN f->>'kind' IN ('text','reasoning') THEN f->>'kind' ELSE '' END AS kind,
		CASE WHEN f->>'phase' IN ('started','completed') THEN f->>'phase' ELSE '' END AS phase,
		count(*),coalesce(sum(CASE WHEN f->>'type'='delta' AND f->>'kind'='text' THEN octet_length(f->>'text') ELSE 0 END),0)
		FROM chat_turn_batches b CROSS JOIN LATERAL jsonb_array_elements(b.frames) f
		WHERE b.turn_id=$1 GROUP BY 1,2,3 ORDER BY 1,2,3`, turnID)
	if err != nil {
		return TurnInspection{}, err
	}
	defer rows.Close()
	out.Frames = []FrameCounts{}
	for rows.Next() {
		var frame FrameCounts
		if err := rows.Scan(&frame.Type, &frame.Kind, &frame.Phase, &frame.Count, &frame.TextBytes); err != nil {
			return TurnInspection{}, err
		}
		out.Frames = append(out.Frames, frame)
	}
	if err := rows.Err(); err != nil {
		return TurnInspection{}, err
	}
	return out, tx.Commit(ctx)
}
