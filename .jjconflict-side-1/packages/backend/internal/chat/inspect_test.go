package chat

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInspectTurnReportsDurableProgressWithoutContentOrMutation(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "inspect-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	grant, err := store.Claim(t.Context(), scope, accepted.TurnID, time.Minute)
	require.NoError(t, err)
	require.NoError(t, store.MarkProviderStarted(t.Context(), grant))
	before, err := store.InspectTurn(t.Context(), accepted.TurnID)
	require.NoError(t, err)
	require.Equal(t, StateRunning, before.State)
	require.NotNil(t, before.ProviderStartedAt)
	require.NotNil(t, before.LeaseExpiresAt)
	require.Empty(t, before.Frames)
	require.Nil(t, before.LastBatchAt)
	_, err = store.Commit(t.Context(), CommitInput{TurnID: grant.TurnID, Generation: grant.Generation, Token: grant.Token, Expected: grant.Cursor, Frames: []json.RawMessage{frame(runID, "private-answer-sentinel β")}})
	require.NoError(t, err)
	after, err := store.InspectTurn(t.Context(), accepted.TurnID)
	require.NoError(t, err)
	require.Equal(t, int64(1), after.HeadBatch)
	require.Equal(t, int64(1), after.HeadPosition)
	require.NotNil(t, after.LastBatchAt)
	require.Equal(t, []FrameCounts{{Type: "delta", Kind: "text", Count: 1, TextBytes: int64(len("private-answer-sentinel β"))}}, after.Frames)
	encoded, err := json.Marshal(after)
	require.NoError(t, err)
	for _, secret := range []string{"private-answer-sentinel", "hello", journal.Token, grant.Token, "request_payload", "token_hash", "access_hash", "writer_hash"} {
		require.NotContains(t, string(encoded), secret)
	}
	repeated, err := store.InspectTurn(t.Context(), accepted.TurnID)
	require.NoError(t, err)
	require.Equal(t, after, repeated, "inspection does not renew the producer, modify the journal or touch timestamps")
	_, err = store.InspectTurn(t.Context(), uuid.NewString())
	require.ErrorIs(t, err, ErrNotFound)
	_, err = store.InspectTurn(t.Context(), "bad-id-secret-sentinel")
	require.ErrorIs(t, err, ErrInvalidRequest)
}
