package compose

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/internal/chat/turncredential"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
)

type timelineStreamFunc func(context.Context, ports.ModelStreamGrant) (io.ReadCloser, error)

func (f timelineStreamFunc) RunModelStream(ctx context.Context, g ports.ModelStreamGrant) (io.ReadCloser, error) {
	return f(ctx, g)
}

func TestTimelineMeteredModelUsesOwnedHiddenTurn(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	owner, err := seed.CreateUser(ctx, pool, "timeline-meter-owner")
	require.NoError(t, err)
	store, err := chat.NewStore(pool)
	require.NoError(t, err)
	calls := 0
	turnID := ""
	host := &accountModelStream{pool: pool, store: store, host: timelineStreamFunc(func(ctx context.Context, g ports.ModelStreamGrant) (io.ReadCloser, error) {
		calls++
		if g.Metered == nil {
			return nil, ports.ErrModelCredentialMissing
		}
		require.Equal(t, owner, g.Metered.OwnerID)
		require.Zero(t, g.Metered.RepositoryID)
		token := turncredential.Mint(g.Metered.TurnID, g.Metered.Generation, g.Metered.Token)
		verified, err := turncredential.Verify(ctx, pool, token)
		require.NoError(t, err)
		require.Equal(t, owner, verified.UserID)
		require.Zero(t, verified.RepositoryID)
		turnID = verified.TurnID
		require.JSONEq(t, `{"instructions":"Summarize the outcome","messages":[],"tools":[]}`, string(g.Request))
		return io.NopCloser(strings.NewReader("summary")), nil
	})}
	stream, err := host.RunModelStream(ctx, ports.ModelStreamGrant{OwnerID: owner, Request: json.RawMessage(`{"instructions":"Summarize the outcome","messages":[],"tools":[]}`)})
	require.NoError(t, err)
	defer stream.Close()
	require.Equal(t, 2, calls)
	var purpose, state string
	var branch *string
	require.NoError(t, pool.QueryRow(ctx, `SELECT request_payload->>'purpose',state,conversation_id FROM chat_turns WHERE id=$1`, turnID).Scan(&purpose, &state, &branch))
	require.Equal(t, "timeline-summary", purpose)
	require.Equal(t, "completed", state)
	require.Nil(t, branch)
	history, err := store.History(ctx, chat.Scope{UserID: owner, Owner: "timeline-meter-owner"}, "", 50)
	require.NoError(t, err)
	require.Empty(t, history.Conversations)
}
