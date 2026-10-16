package services

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/stretchr/testify/require"
)

// A failed TODO used to leave nothing anywhere that said where it stopped:
// flowruntime.Run carries the typed failure's own message, every recorder read
// only the tag, and the item's reason is the product's typed sentence. The
// record names the closed-set stage the raising flow declared, and nothing of
// the message's text.
func TestMythicalFailedStageNamesOnlyAClosedSetSite(t *testing.T) {
	for _, tc := range []struct{ tag, message, stage string }{
		// What a real composed Linux install answered: a confined coding host
		// whose supervised snapshot helper had no writable temporary directory.
		// The runtime reports the message under the error's own code, which is
		// already the tag's last segment, so the stage is the site under it.
		{
			"coding/Error/execution",
			"execution: native_snapshot_unavailable: Native snapshot could not run (unknown): ENOENT",
			"native_snapshot_unavailable",
		},
		{
			"coding/Error/execution",
			"execution: planning_memory_unavailable: Planning memory could not be gathered: boom",
			"planning_memory_unavailable",
		},
		{"coding/Error/stale_revision", "stale_revision: head_moved: Native code changed", "head_moved"},
		// A message that names its site without the code prefix still works.
		{"coding/Error/stale_revision", "head_moved: Native code changed", "head_moved"},
		// A runtime that names no site says so, rather than inventing one.
		{"coding/Error/invalid_receipt", "", "unnamed"},
		{"coding/Error/invalid_receipt", "Fast receipt build does not identify the current revision", "unnamed"},
		{
			"coding/Error/invalid_receipt",
			"invalid_receipt: Fast receipt build does not identify the current revision",
			"unnamed",
		},
		// Nothing outside [a-z_] is a site: not a path, not an id, not a URL,
		// not a credential, not an upstream status and not prose with a colon.
		{"coding/Error/execution", "execution: /tmp/sm-p-AbC123: no such file", "unnamed"},
		{"coding/Error/execution", "Authorization: Bearer sk-live-0123456789", "unnamed"},
		{"coding/Error/execution", "https://api.github.com/repos/o/r: 404", "unnamed"},
		{"coding/Error/execution", "4a9f1c2e-0000-4000-8000-00000000abcd: refused", "unnamed"},
		{"coding/Error/execution", "Planning memory: could not be gathered", "unnamed"},
		{"coding/Error/execution", strings.Repeat("a", 49) + ": too long to be a site", "unnamed"},
		{"coding/Error/execution", strings.Repeat("a", 48) + ": still a site", strings.Repeat("a", 48)},
	} {
		require.Equal(t, tc.stage, mythicalFailedStage(tc.tag, tc.message), tc.message)
	}
}

// The record carries the fault, the tag and the stage, and the projection's
// own request_outcome is unchanged by it.
func TestMythicalRunFailedRecordsTheStageAndChangesNoOutcome(t *testing.T) {
	buffer := &bytes.Buffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buffer, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	run := &flowruntime.Run{
		Status:         "failed",
		FailureFault:   "infra",
		FailureTag:     "coding/Error/execution",
		FailureMessage: "execution: native_snapshot_unavailable: Native snapshot could not run (unknown): ENOENT /tmp/sm-p-XXXXXX",
	}
	outcome := mythicalFailedOutcome(flowdispatch.ProjectionUpdate{
		Checkpoint: flowdispatch.RuntimeCheckpoint{FlowID: "todo", Run: run},
	})
	require.Equal(t, mythicalOutage+"infra: coding/Error/execution", outcome)

	var record struct {
		Message string `json:"msg"`
		Flow    string `json:"flow"`
		Fault   string `json:"fault"`
		Tag     string `json:"tag"`
		Stage   string `json:"stage"`
	}
	line := strings.TrimSpace(buffer.String())
	require.NotEmpty(t, line, "a registered failure records its stage")
	require.NoError(t, json.Unmarshal([]byte(strings.Split(line, "\n")[0]), &record))
	require.Equal(t, "mythical.run_failed", record.Message)
	require.Equal(t, "todo", record.Flow)
	require.Equal(t, "infra", record.Fault)
	require.Equal(t, "coding/Error/execution", record.Tag)
	require.Equal(t, "native_snapshot_unavailable", record.Stage)
	// No part of the failure's own text reaches the record.
	require.NotContains(t, buffer.String(), "/tmp/sm-p-")
	require.NotContains(t, buffer.String(), "ENOENT")
}
