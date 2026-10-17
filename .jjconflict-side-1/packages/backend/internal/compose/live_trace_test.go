package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/live"
	"github.com/stretchr/testify/require"
)

func TestConversationTraceHasItsOwnAudienceAndChangesWithPrivateWork(t *testing.T) {
	ctx := t.Context()
	thinking := "First thought"
	reader := func(_ context.Context, member int64, branch string) (json.RawMessage, error) {
		if member == 99 {
			return nil, fmt.Errorf("membership revoked")
		}
		return json.Marshal(map[string]any{"id": branch, "member": member, "thinking": thinking})
	}
	topics := &liveTopics{
		conversation: func(_ context.Context, _ int64, branch string) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"id": branch, "entries": []any{}})
		},
		conversationTrace: reader,
	}
	baseline, code := topics.resolve(ctx, "conversation:main", 7, "repo", 1)
	require.Empty(t, code)
	trace, code := topics.resolve(ctx, "conversation-trace:main", 7, "repo", 1)
	require.Empty(t, code)
	peer, code := topics.resolve(ctx, "conversation-trace:main", 7, "repo", 2)
	require.Empty(t, code)
	require.NotEqual(t, baseline.Key, trace.Key)
	require.NotEqual(t, trace.Key, peer.Key)
	before, err := trace.Build(ctx)
	require.NoError(t, err)
	publicBefore, err := baseline.Build(ctx)
	require.NoError(t, err)
	thinking = "Second thought"
	after, err := trace.Build(ctx)
	require.NoError(t, err)
	publicAfter, err := baseline.Build(ctx)
	require.NoError(t, err)
	require.NotEqual(t, string(before), string(after), "private-only work must invalidate the progress stream")
	require.Equal(t, string(publicBefore), string(publicAfter))
	_, code = topics.resolve(ctx, "conversation-trace:main", 7, "repo", 99)
	require.Equal(t, live.Forbidden, code)
	_, code = topics.resolve(ctx, "conversation-trace:main", 0, "", 1)
	require.Empty(t, code, "a hosted personal conversation has no install repository")
	_, code = topics.resolve(ctx, "conversation-trace:main", 0, "", 0)
	require.Equal(t, live.Unsupported, code)
}
