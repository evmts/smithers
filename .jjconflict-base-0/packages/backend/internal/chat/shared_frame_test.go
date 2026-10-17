package chat

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSharedFrameKeepsPrivateTraceWithTheRequester(t *testing.T) {
	private := []string{
		`{"runId":"r","type":"delta","kind":"reasoning","text":"secret plan"}`,
		`{"runId":"r","type":"link.authored","link":0,"scriptDigest":"d","script":"await commands({argv:['cat','.env']})"}`,
		`{"runId":"r","type":"call.started","link":0,"ordinal":0,"name":"commands","arguments":"private invocation","description":"Run commands"}`,
		`{"runId":"r","type":"call.settled","link":0,"ordinal":0,"name":"commands","verdict":"run"}`,
		`{"runId":"r","type":"gate.rejected","link":0,"kind":"shape","message":"denied"}`,
	}
	for _, raw := range private {
		require.True(t, sharedFrame(json.RawMessage(raw), true), raw)
		require.False(t, sharedFrame(json.RawMessage(raw), false), raw)
	}
	for _, raw := range []string{`{"runId":"r","type":"delta","kind":"text","text":"answer"}`, `{"runId":"r","type":"done","reason":"stop"}`} {
		require.True(t, sharedFrame(json.RawMessage(raw), true), raw)
		require.True(t, sharedFrame(json.RawMessage(raw), false), raw)
	}
	tool := `{"runId":"r","type":"tool_call","call_id":"c","name":"commands","arguments":"{\"argv\":[\"cat\",\".env\"]}"}`
	require.False(t, sharedFrame(json.RawMessage(tool), true))
	require.False(t, sharedFrame(json.RawMessage(tool), false))
}

func TestTurnTimingFreezesAtTheTerminalBatch(t *testing.T) {
	accepted := int64(1_000_000)
	last := time.UnixMilli(accepted + 47_000)
	running := turnRecord{AcceptedAtMS: &accepted, UpdatedAt: time.UnixMilli(accepted + 5_000)}
	start, finish := turnTiming(running, nil)
	require.Equal(t, accepted, start)
	require.Zero(t, finish)
	// A later summary or subject update moves UpdatedAt, never the duration.
	done := turnRecord{AcceptedAtMS: &accepted, Terminal: true, State: StateCompleted, UpdatedAt: time.UnixMilli(accepted + 900_000)}
	start, finish = turnTiming(done, &last)
	require.Equal(t, accepted, start)
	require.Equal(t, accepted+47_000, finish)
	uncertain := done
	uncertain.State = StateUncertain
	start, finish = turnTiming(uncertain, &last)
	require.Equal(t, accepted, start)
	require.Zero(t, finish)
	// A terminal turn without a receipt has no honest duration.
	start, finish = turnTiming(done, nil)
	require.Equal(t, accepted, start)
	require.Zero(t, finish)
	start, finish = turnTiming(turnRecord{Terminal: true}, &last)
	require.Zero(t, start)
	require.Zero(t, finish)
}
