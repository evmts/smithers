package flowdispatch

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

// A refused projection used to surface only as product_projection_unavailable;
// the log now names the projector's reason and the ids, and never the run's
// output or event page (Security d-8nr131).
func TestProjectionRefusalLogsReasonAndIdsNeverOutput(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(previous)
	output := `{"turnId":"run-42","messages":[{"role":"assistant","content":"PAYLOAD-SENTINEL"}]}`
	checkpoint := RuntimeCheckpoint{RunID: "dispatch:op-1", FlowID: "coding/dispatch", Cursor: "7",
		Run: &flowruntime.Run{RunID: "dispatch:op-1", FlowID: "coding/dispatch", Status: "completed", FinalOutput: &output}}

	logProjectionRefusal(context.Background(), "op-1", checkpoint, jobs.StateWaiting, 3, "4", errors.New("completed coding turn output identity is invalid"))

	require.NotContains(t, buf.String(), "PAYLOAD-SENTINEL")
	var line map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &line))
	require.Equal(t, "flow runtime projection refused", line["msg"])
	require.Equal(t, "product_projection_unavailable", line["code"])
	require.Equal(t, "op-1", line["operation_id"])
	require.Equal(t, "dispatch:op-1", line["run_id"])
	require.Equal(t, "coding/dispatch", line["flow_id"])
	require.Equal(t, "completed coding turn output identity is invalid", line["error"])
	require.EqualValues(t, 3, line["events"])
	require.Equal(t, "4", line["events_after"])
}
