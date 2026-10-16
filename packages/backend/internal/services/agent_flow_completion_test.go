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
		{"reported legacy reply", `{"messages":[{"role":"assistant","content":"Smithers agent online on bare metal."}]}`, []string{"Smithers agent online on bare metal."}},
		{"ordered exact text", `{"turnId":"run-42","runId":"host","messages":[{"ordinal":0,"role":"assistant","content":" first\n "},{"ordinal":1,"role":"assistant","content":"second"}]}`, []string{" first\n ", "second"}},
		{"malformed", `{`, nil},
		{"null", `null`, nil},
		{"missing messages", `{}`, nil},
		{"empty messages", `{"messages":[]}`, nil},
		{"null messages", `{"messages":null}`, nil},
		{"empty text", `{"messages":[{"role":"assistant","content":""}]}`, nil},
		{"nontext content", `{"messages":[{"role":"assistant","content":{"value":"reply"}}]}`, nil},
		{"user role", `{"messages":[{"role":"user","content":"reply"}]}`, nil},
		{"tool role", `{"messages":[{"role":"tool","content":"reply"}]}`, nil},
		{"wrong turn", `{"turnId":"run-43","messages":[{"role":"assistant","content":"reply"}]}`, nil},
		{"wrong run", `{"runId":"other","messages":[{"role":"assistant","content":"reply"}]}`, nil},
		{"out of order", `{"messages":[{"ordinal":1,"role":"assistant","content":"reply"}]}`, nil},
		{"duplicate ordinal", `{"messages":[{"ordinal":0,"role":"assistant","content":"one"},{"ordinal":0,"role":"assistant","content":"two"}]}`, nil},
		{"fractional ordinal", `{"messages":[{"ordinal":0.5,"role":"assistant","content":"reply"}]}`, nil},
		{"invalid later row", `{"messages":[{"role":"assistant","content":"one"},{"role":"system","content":"two"}]}`, nil},
		{"utf16 limit", `{"messages":[{"role":"assistant","content":"` + strings.Repeat("😀", codingTriggerTextLimit/2) + `"}]}`, []string{strings.Repeat("😀", codingTriggerTextLimit/2)}},
		{"oversized text", `{"messages":[{"role":"assistant","content":"` + strings.Repeat("😀", codingTriggerTextLimit/2+1) + `"}]}`, nil},
		{"limit replies", `{"messages":[` + strings.Repeat(`{"role":"assistant","content":"a"},`, codingReplyMessageLimit-1) + `{"role":"assistant","content":"b"}]}`, append(slices.Repeat([]string{"a"}, codingReplyMessageLimit-1), "b")},
		{"too many replies", `{"messages":[` + strings.Repeat(`{"role":"assistant","content":"a"},`, codingReplyMessageLimit) + `{"role":"assistant","content":"b"}]}`, nil},
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
