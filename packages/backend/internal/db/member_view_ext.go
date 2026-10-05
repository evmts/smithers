package db

import (
	"context"
	"encoding/json"
)

// MainViewState reads only this member's main conversation view.
func (q *Queries) MainViewState(ctx context.Context, repo, user int64) (json.RawMessage, error) {
	var state json.RawMessage
	err := q.db.QueryRow(ctx, `SELECT coalesce(view_state->'main', '{"last_seen_seq":0}'::jsonb)
 FROM collaborators WHERE repository_id=$1 AND user_id=$2`, repo, user).Scan(&state)
	return state, err
}

// SaveMainViewState patches the member's view and monotonically advances last
// look. A delayed retry can never make already-seen merges unread again.
func (q *Queries) SaveMainViewState(ctx context.Context, repo, user int64, patch json.RawMessage) (json.RawMessage, error) {
	var state json.RawMessage
	err := q.db.QueryRow(ctx, `UPDATE collaborators SET view_state = jsonb_set(view_state, '{main}',
 coalesce(view_state->'main','{}'::jsonb) || $3::jsonb || jsonb_build_object('last_seen_seq',
 greatest(coalesce((view_state->'main'->>'last_seen_seq')::bigint,0),
 coalesce(($3::jsonb->>'last_seen_seq')::bigint,0))))
 WHERE repository_id=$1 AND user_id=$2
 RETURNING view_state->'main'`, repo, user, patch).Scan(&state)
	return state, err
}
