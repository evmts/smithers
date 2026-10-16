package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// These wire fixtures are independent examples of the NativeAgent frame union.
// They exercise the journal's admission boundary without a store or SQL fake.
func TestChatFrameUnitOptionalFieldsAndEnumeratedValues(t *testing.T) {
	frames := []string{
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":{"command":"theme","mode":"dark"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"help","verdict":"run","ui":{"command":"help"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"runs.trace.select","verdict":"run","ui":{"command":"runs.trace.select","runId":"run-1","nodeId":"build","seq":4}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"runs.graph.follow","verdict":"run","ui":{"command":"runs.graph.follow","runId":"run-1","follow":"on"}}`,
		`{"runId":"run","type":"delta","kind":"reasoning","text":""}`,
		`{"runId":"run","type":"tool_call","call_id":"call","name":"tool","arguments":"{}"}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":1,"name":"tool","verdict":"hit","resultDigest":"digest"}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":1,"name":"tool","verdict":"replay"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"shape","message":"bad shape"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"fuel"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"catalog"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"call_failed"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"script_failed"}`,
		`{"runId":"run","type":"link.ended","link":0,"outcome":"done"}`,
		`{"runId":"run","type":"link.ended","link":0,"outcome":"to"}`,
		`{"runId":"run","type":"park","code":"event","card":{}}`,
		`{"runId":"run","type":"park","code":"timer"}`,
		`{"runId":"run","type":"park","code":"quota"}`,
		`{"runId":"run","type":"park","code":"plugin"}`,
	}
	for _, raw := range frames {
		t.Run(raw, func(t *testing.T) {
			var wire struct{ Type string }
			require.NoError(t, json.Unmarshal([]byte(raw), &wire))
			meta, err := validateFrames([]json.RawMessage{json.RawMessage(raw)}, "run")
			require.NoError(t, err)
			require.Equal(t, frameMeta{RunID: "run", Type: wire.Type}, meta)
			require.Equal(t, State("running"), terminalState(meta))
		})
	}
}

func TestChatFrameUnitMalformedFieldsFailClosed(t *testing.T) {
	for _, raw := range []string{
		``, `{`, `[]`, `null`, `{"runId":"other","type":"done"}`,
		`{"runId":1,"type":"done"}`, `{"runId":"run"}`, `{"runId":"run","type":1}`,
		`{"runId":"run","type":"invented"}`,
		`{"runId":"run","type":"delta","kind":"audio","text":"x"}`,
		`{"runId":"run","type":"delta","kind":"text","text":null}`,
		`{"runId":"run","type":"tool_call","call_id":"call","name":"tool"}`,
		`{"runId":"run","type":"tool_call","call_id":1,"name":"tool","arguments":"{}"}`,
		`{"runId":"run","type":"card","card":[]}`,
		`{"runId":"run","type":"card.update","id":"card","patch":null}`,
		`{"runId":"run","type":"card.update","id":1,"patch":{}}`,
		`{"runId":"run","type":"link.authored","link":0,"scriptDigest":1,"script":"x"}`,
		`{"runId":"run","type":"call.started","link":0,"name":"tool"}`,
		`{"runId":"run","type":"call.started","link":0,"ordinal":0,"name":false}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"tool","verdict":"cache"}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"tool","verdict":"run","resultDigest":null}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":null}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"todo.drop","verdict":"run","ui":{"command":"theme","mode":"dark"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":{"command":"todo.drop","mode":"dark"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":{"command":"theme","mode":null}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":{"command":"theme","mode":"dark","extra":"authority"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":{"mode":"dark"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"theme","verdict":"run","ui":"theme"}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"form.submit","verdict":"run","ui":{"command":"form.submit","cardId":"card-7"}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"card.dismiss","verdict":"run","ui":{"command":"card.dismiss","cardId":{"nested":true}}}`,
		`{"runId":"run","type":"call.settled","link":0,"ordinal":0,"name":"search.files","verdict":"run","ui":{"command":"search.files","query":["retry"]}}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"unknown"}`,
		`{"runId":"run","type":"gate.rejected","link":0,"kind":"denied","message":1}`,
		`{"runId":"run","type":"link.ended","link":0,"outcome":"failed"}`,
		`{"runId":"run","type":"steering.drained","link":0,"count":0}`,
		`{"runId":"run","type":"park","code":"unknown"}`,
		`{"runId":"run","type":"park","code":"approval","card":null}`,
		`{"runId":"run","type":"done","reason":"success"}`,
		`{"runId":"run","type":"done","reason":null}`,
		`{"runId":"run","type":"done","error":{}}`,
	} {
		t.Run(raw, func(t *testing.T) {
			meta, err := validateFrames([]json.RawMessage{json.RawMessage(raw)}, "run")
			require.ErrorIs(t, err, ErrInvalidFrame)
			require.Equal(t, frameMeta{}, meta, "rejection must not publish partial terminal metadata")
		})
	}
}

func TestChatFrameUnitNumericAndBatchBoundaries(t *testing.T) {
	for _, row := range []struct {
		value string
		valid bool
	}{
		{"0", true}, {"9007199254740991", true}, {"9007199254740992", false},
		{"-1", false}, {"0.5", false}, {`"0"`, false}, {"null", false},
		{"1e309", false}, {"1e0", true},
	} {
		t.Run(row.value, func(t *testing.T) {
			raw := json.RawMessage(`{"runId":"run","type":"call.started","link":` + row.value + `,"ordinal":0,"name":"tool"}`)
			meta, err := validateFrames([]json.RawMessage{raw}, "run")
			if row.valid {
				require.NoError(t, err)
				require.Equal(t, frameMeta{RunID: "run", Type: "call.started"}, meta)
			} else {
				require.ErrorIs(t, err, ErrInvalidFrame)
				require.Equal(t, frameMeta{}, meta)
			}
		})
	}
	for _, count := range []int{0, 1, 256, 257} {
		frames := make([]json.RawMessage, count)
		for i := range frames {
			frames[i] = json.RawMessage(`{"runId":"run","type":"delta","kind":"text","text":"x"}`)
		}
		_, err := validateFrames(frames, "run")
		if count == 0 || count == 257 {
			require.ErrorIs(t, err, ErrInvalidFrame)
		} else {
			require.NoError(t, err)
		}
	}
	for _, count := range []string{"1", "9007199254740991"} {
		meta, err := validateFrames([]json.RawMessage{json.RawMessage(`{"runId":"run","type":"steering.drained","link":0,"count":` + count + `}`)}, "run")
		require.NoError(t, err)
		require.Equal(t, frameMeta{RunID: "run", Type: "steering.drained"}, meta)
	}
	invalidUTF8 := json.RawMessage(append([]byte(`{"runId":"run","type":"delta","kind":"text","text":"`), 0xff))
	invalidUTF8 = append(invalidUTF8, []byte(`"}`)...)
	_, err := validateFrames([]json.RawMessage{invalidUTF8}, "run")
	require.ErrorIs(t, err, ErrInvalidFrame, "invalid UTF-8 cannot silently alter committed text")
	// Pin the declared two-MiB frame cap, independently of the implementation constant.
	for _, size := range []int{2_097_151, 2_097_152, 2_097_153} {
		prefix, suffix := `{"runId":"run","type":"delta","kind":"text","text":"`, `"}`
		raw := json.RawMessage(prefix + strings.Repeat("x", size-len(prefix)-len(suffix)) + suffix)
		_, err := validateFrames([]json.RawMessage{raw}, "run")
		if size > 2_097_152 {
			require.ErrorIs(t, err, ErrInvalidFrame)
		} else {
			require.NoError(t, err)
		}
	}
}

func TestChatFrameUnitTerminalOrderingAndState(t *testing.T) {
	for _, row := range []struct {
		fields    string
		reason    string
		errorText string
		state     State
	}{
		{"", "", "", "completed"},
		{`,"reason":"stop"`, "stop", "", "completed"},
		{`,"reason":"tool_call"`, "tool_call", "", "completed"},
		{`,"reason":"tool_limit"`, "tool_limit", "", "completed"},
		{`,"error":"provider failed"`, "", "provider failed", "failed"},
		{`,"reason":"cancelled","error":"provider failed"`, "cancelled", "provider failed", "cancelled"},
	} {
		terminal := json.RawMessage(`{"runId":"run","type":"done"` + row.fields + `}`)
		delta := json.RawMessage(`{"runId":"run","type":"delta","kind":"text","text":"last text"}`)
		meta, err := validateFrames([]json.RawMessage{delta, terminal}, "run")
		require.NoError(t, err)
		require.Equal(t, frameMeta{RunID: "run", Type: "done", Reason: row.reason, Error: row.errorText}, meta)
		require.Equal(t, row.state, terminalState(meta))
		for _, after := range []json.RawMessage{delta, terminal} {
			meta, err := validateFrames([]json.RawMessage{terminal, after}, "run")
			require.ErrorIs(t, err, ErrInvalidFrame, "no frame may follow a terminal frame within a batch")
			require.Equal(t, frameMeta{}, meta)
		}
	}
	for _, row := range []struct {
		value    State
		terminal bool
	}{
		{"accepted", false}, {"running", false}, {"completed", true}, {"failed", true},
		{"cancelled", true}, {"uncertain", true}, {"retired", true}, {"unknown", false}, {"", false},
	} {
		require.Equal(t, row.terminal, row.value.Terminal(), string(row.value))
	}
}

// The capacity receipt is the one terminal frame whose cause a client cannot
// read from its sentence: production turn 83bca322 spent 206.8 s across five
// host_no_capacity generations, and the app could only show the fleet's prose
// under a Details disclosure because the frame named no code. The frame now
// carries the dispatcher's own code beside the sentence, and both have to
// survive the journal's admission boundary.
func TestChatFrameUnitCapacityReceiptCarriesItsCodeAndSentence(t *testing.T) {
	raw := hostNoCapacityFrame("run")
	var frame struct {
		RunID string `json:"runId"`
		Type  string `json:"type"`
		Code  string `json:"code"`
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(raw, &frame))
	require.Equal(t, "run", frame.RunID)
	require.Equal(t, "done", frame.Type)
	// The code a client branches on is the same string the dispatcher logs and
	// counts, so a reader of either cannot be told two different things.
	require.Equal(t, codeHostNoCapacity, frame.Code)
	require.Equal(t, hostNoCapacityMessage, frame.Error)
	meta, err := validateFrames([]json.RawMessage{raw}, "run")
	require.NoError(t, err)
	require.Equal(t, frameMeta{RunID: "run", Type: "done", Error: hostNoCapacityMessage}, meta)
	require.Equal(t, StateFailed, terminalState(meta))
	// A turn that produced output keeps the uncertain receipt instead: this
	// frame claims nothing was lost, which is only true before a provider ran.
	require.NotContains(t, string(errorFrame("run", "The model host stopped before completing the turn.")), codeHostNoCapacity)
}
