package services

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"strings"
	"testing"
)

func TestSummaryTextIsSealedInertText(t *testing.T) {
	for _, tc := range []struct {
		name, output, want string
		fail               bool
	}{
		{"intent and outcome", `{"prompt":"Find help commands","answer":"Quickstart opened"}`, `{"v":2,"recipe":2,"prompt":"Find help commands","answer":"Quickstart opened"}`, false},
		{"failure is an outcome", `{"prompt":"Switch to dark mode","answer":"Theme change unavailable"}`, `{"v":2,"recipe":2,"prompt":"Switch to dark mode","answer":"Theme change unavailable"}`, false},
		{"commands remain data", `{"prompt":"Inspect retry_test.go","answer":"rm -rf /; import repo/flow.ts; tool()"}`, `{"v":2,"recipe":2,"prompt":"Inspect retry_test.go","answer":"rm -rf /; import repo/flow.ts; tool()"}`, false},
		{"missing prompt", `{"answer":"Quickstart opened"}`, "", true},
		{"empty outcome", `{"prompt":"Find help","answer":" "}`, "", true},
		{"copied prose envelope", "I will do that", "", true},
		{"wrong type", `{"prompt":1,"answer":"Done"}`, "", true},
		{"word cap", `{"prompt":"one two three four five six seven eight nine","answer":"Reply stopped"}`, `{"v":2,"recipe":2,"prompt":"one two three four five six seven eight","answer":"Reply stopped"}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			delta, _ := json.Marshal(map[string]string{"type": "delta", "kind": "text", "text": tc.output})
			value, err := summaryText(strings.NewReader(string(delta) + "\n{\"type\":\"done\"}\n"))
			if tc.fail {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.JSONEq(t, tc.want, value)
			}
		})
	}
	for _, wire := range []string{"{", "{\"type\":\"done\",\"error\":\"provider failed\"}\n", "{\"type\":\"delta\",\"kind\":\"text\",\"text\":\"partial\"}\n", "{\"type\":\"tool_call\",\"name\":\"exec\",\"arguments\":\"rm -rf /\"}\n{\"type\":\"done\"}\n"} {
		_, err := summaryText(strings.NewReader(wire))
		require.Error(t, err)
	}
}
