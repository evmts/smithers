package services

import (
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
)

func TestCompletedCodingMessages(t *testing.T) {
	for _, tc := range []struct {
		name, output string
		want         []string
	}{
		{"no turnId", `{"messages":[{"role":"assistant","content":"Smithers agent online on bare metal."}]}`, nil},
		{"ordered exact text", `{"turnId":"run-42","runId":"host","messages":[{"ordinal":0,"role":"assistant","content":" first\n "},{"ordinal":1,"role":"assistant","content":"second"}]}`, []string{" first\n ", "second"}},
		{"malformed", `{`, nil},
		{"null", `null`, nil},
		{"missing messages", `{"turnId":"run-42"}`, nil},
		{"empty messages", `{"turnId":"run-42","messages":[]}`, nil},
		{"null messages", `{"turnId":"run-42","messages":null}`, nil},
		{"empty text", `{"turnId":"run-42","messages":[{"role":"assistant","content":""}]}`, nil},
		{"nontext content", `{"turnId":"run-42","messages":[{"role":"assistant","content":{"value":"reply"}}]}`, nil},
		{"user role", `{"turnId":"run-42","messages":[{"role":"user","content":"reply"}]}`, nil},
		{"tool role", `{"turnId":"run-42","messages":[{"role":"tool","content":"reply"}]}`, nil},
		{"wrong turn", `{"turnId":"run-43","messages":[{"role":"assistant","content":"reply"}]}`, nil},
		{"echoed host run id is the host's handle", `{"turnId":"run-42","runId":"other","messages":[{"role":"assistant","content":"reply"}]}`, []string{"reply"}},
		{"out of order", `{"turnId":"run-42","messages":[{"ordinal":1,"role":"assistant","content":"reply"}]}`, nil},
		{"duplicate ordinal", `{"turnId":"run-42","messages":[{"ordinal":0,"role":"assistant","content":"one"},{"ordinal":0,"role":"assistant","content":"two"}]}`, nil},
		{"fractional ordinal", `{"turnId":"run-42","messages":[{"ordinal":0.5,"role":"assistant","content":"reply"}]}`, nil},
		{"invalid later row", `{"turnId":"run-42","messages":[{"role":"assistant","content":"one"},{"role":"system","content":"two"}]}`, nil},
		{"utf16 limit", `{"turnId":"run-42","messages":[{"role":"assistant","content":"` + strings.Repeat("😀", codingTriggerTextLimit/2) + `"}]}`, []string{strings.Repeat("😀", codingTriggerTextLimit/2)}},
		{"oversized text", `{"turnId":"run-42","messages":[{"role":"assistant","content":"` + strings.Repeat("😀", codingTriggerTextLimit/2+1) + `"}]}`, nil},
		{"limit replies", `{"turnId":"run-42","messages":[` + strings.Repeat(`{"role":"assistant","content":"a"},`, codingReplyMessageLimit-1) + `{"role":"assistant","content":"b"}]}`, append(slices.Repeat([]string{"a"}, codingReplyMessageLimit-1), "b")},
		{"too many replies", `{"turnId":"run-42","messages":[` + strings.Repeat(`{"role":"assistant","content":"a"},`, codingReplyMessageLimit) + `{"role":"assistant","content":"b"}]}`, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			update := flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: "host", Run: &flowruntime.Run{RunID: "host", FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &tc.output}}}
			messages, err := completedCodingMessages(update, agentFlowProjection{WorkflowRunID: 42})
			if tc.want == nil {
				require.Error(t, err)
				require.Nil(t, messages)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.want, messages)
			}
		})
	}
	for _, run := range []*flowruntime.Run{nil, {}, {RunID: "host", FlowID: codingDispatchFlowID, Status: "completed"}} {
		_, err := completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{Run: run}}, agentFlowProjection{})
		require.Error(t, err)
	}
	// A hosted turn: the bridge launched dispatch:<op>, and the coding flow ran
	// inside it as a child execution whose id it echoes as runId (prod
	// 2026-10-19, op 43b468ed / run-18065). The server-assigned turnId binds
	// the answer to its turn; the echoed runId is the host's own handle.
	hosted := `{"turnId":"run-42","runId":"a389d9117b55e397df4f33e47adaed106967d3e59b6a22ebeef84e7187a9e5b9","messages":[{"ordinal":0,"role":"assistant","content":"done"}]}`
	dispatch := "dispatch:43b468ed-b2b4-493e-aafa-6f2a1141b500"
	messages, err := completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: dispatch, Run: &flowruntime.Run{RunID: dispatch, FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &hosted}}}, agentFlowProjection{WorkflowRunID: 42})
	require.NoError(t, err, "a hosted answer echoing its child execution id completes the turn")
	require.Equal(t, []string{"done"}, messages)
	_, err = completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: dispatch, Run: &flowruntime.Run{RunID: dispatch, FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &hosted}}}, agentFlowProjection{WorkflowRunID: 43})
	require.Error(t, err, "another turn's answer is still refused")
	unbound := `{"runId":"a389d9117b55e397df4f33e47adaed106967d3e59b6a22ebeef84e7187a9e5b9","messages":[{"role":"assistant","content":"done"}]}`
	_, err = completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: dispatch, Run: &flowruntime.Run{RunID: dispatch, FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &unbound}}}, agentFlowProjection{WorkflowRunID: 42})
	require.ErrorIs(t, err, errCodingTurnIdentity, "a hosted reply that names no turn is refused (Security d-naxrhi)")
	prior := `{"turnId":"run-41","runId":"a389d9117b55e397df4f33e47adaed106967d3e59b6a22ebeef84e7187a9e5b9","messages":[{"role":"assistant","content":"stale"}]}`
	_, err = completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: dispatch, Run: &flowruntime.Run{RunID: dispatch, FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &prior}}}, agentFlowProjection{WorkflowRunID: 42})
	require.Error(t, err, "a prior turn's answer on the same box is refused")
	_, err = completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: dispatch, Run: &flowruntime.Run{RunID: "a389d9117b55e397df4f33e47adaed106967d3e59b6a22ebeef84e7187a9e5b9", FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &hosted}}}, agentFlowProjection{WorkflowRunID: 42})
	require.Error(t, err, "output read from any run other than the launched one is refused")
	output := `{"messages":[{"role":"assistant","content":"reply"}]}`
	for _, run := range []flowruntime.Run{
		{RunID: "other", FlowID: codingDispatchFlowID, Status: "completed", FinalOutput: &output},
		{RunID: "host", FlowID: "other", Status: "completed", FinalOutput: &output},
		{RunID: "host", FlowID: codingDispatchFlowID, Status: "failed", FinalOutput: &output},
	} {
		_, err := completedCodingMessages(flowdispatch.ProjectionUpdate{Checkpoint: flowdispatch.RuntimeCheckpoint{RunID: "host", Run: &run}}, agentFlowProjection{})
		require.Error(t, err)
	}
}
