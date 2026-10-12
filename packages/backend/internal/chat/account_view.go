package chat

import (
	"context"
	"encoding/json"
	"errors"
	"math"

	"github.com/jackc/pgx/v5"
)

// accountViewState uses the authenticated account's own view, without creating
// install membership or changing an owner model assignment.
func (s *Store) accountViewState(ctx context.Context, scope Scope, branch string, value json.RawMessage) (json.RawMessage, error) {
	if scope.RepositoryID != 0 || scope.UserID <= 0 || branch != accountConversationID(scope.UserID) {
		return nil, ErrInvalidRequest
	}
	options := pgx.TxOptions{}
	if value == nil {
		options = pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}
	}
	tx, err := s.pool.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var active bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND username=$2 AND NOT prohibit_login)`, scope.UserID, scope.Owner).Scan(&active); err != nil {
		return nil, err
	}
	if !active {
		return nil, ErrForbidden
	}
	var patch map[string]any
	if value != nil {
		object, _, parseErr := parseCanonical(value)
		if parseErr != nil {
			return nil, parseErr
		}
		var ok bool
		patch, ok = object.(map[string]any)
		if !ok {
			return nil, ErrInvalidRequest
		}
		for _, key := range []string{"instructions", "queue"} {
			if _, supplied := patch[key]; supplied {
				return nil, ErrInvalidRequest
			}
		}
		for _, key := range []string{"toasts_hidden", "global_toasts_hidden"} {
			if v, supplied := patch[key]; supplied {
				if _, ok := v.(bool); !ok {
					return nil, ErrInvalidRequest
				}
			}
		}
		if v, supplied := patch["last_seen_seq"]; supplied {
			number, ok := v.(json.Number)
			n, numberErr := number.Float64()
			if !ok || numberErr != nil || n < 0 || n > float64(maxSafeInteger) || math.Trunc(n) != n {
				return nil, ErrInvalidRequest
			}
			patch["last_seen_seq"] = n
		}
		if _, err = tx.Exec(ctx, `INSERT INTO chat_account_views(user_id,conversation_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, scope.UserID, branch); err != nil {
			return nil, err
		}
	}
	query := `SELECT view_state FROM chat_account_views WHERE user_id=$1 AND conversation_id=$2`
	if value != nil {
		query += ` FOR UPDATE`
	}
	var stored json.RawMessage
	err = tx.QueryRow(ctx, query, scope.UserID, branch).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		stored = json.RawMessage(`{}`)
	} else if err != nil {
		return nil, err
	}
	if value != nil {
		var state map[string]any
		if err = json.Unmarshal(stored, &state); err != nil {
			return nil, ErrCorrupt
		}
		for key, v := range patch {
			if key == "last_seen_seq" {
				if previous, ok := state[key].(float64); ok && v.(float64) < previous {
					continue
				}
			}
			state[key] = v
		}
		stored, err = json.Marshal(state)
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, `UPDATE chat_account_views SET view_state=$3 WHERE user_id=$1 AND conversation_id=$2`, scope.UserID, branch, stored); err != nil {
			return nil, err
		}
	}
	queue, err := s.privatePromptQueue(ctx, tx, scope.RepositoryID, scope.UserID, branch)
	if err != nil {
		return nil, err
	}
	var view map[string]json.RawMessage
	if err = json.Unmarshal(stored, &view); err != nil {
		return nil, ErrCorrupt
	}
	delete(view, "queue")
	delete(view, "instructions")
	if len(queue) > 0 {
		view["queue"], err = json.Marshal(queue)
		if err != nil {
			return nil, err
		}
	}
	stored, err = json.Marshal(view)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return stored, nil
}
