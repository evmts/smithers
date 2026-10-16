package services

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowdispatch"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/stretchr/testify/require"
)

// A failed TODO used to leave nothing anywhere that said where it stopped:
// flowruntime.Run carries the typed failure's own message, every recorder read
// only the tag, and the item's reason is the product's typed sentence.
//
// The stage is one of the sites the product's own flows declare, or "unnamed".
// A prefix that merely has the shape of an identifier is NOT a site: that is
// what keeps an error's text, a path, an id, a URL, a header, a payload or a
// credential out of the label.
func TestMythicalFailedStageNamesOnlyADeclaredSite(t *testing.T) {
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
		// A message that names its declared site without the code prefix works.
		{"coding/Error/stale_revision", "head_moved: Native code changed", "head_moved"},
		// A source refusal site a repository flow declares.
		{
			"coding/NativeCodingError/source_refused",
			"source_refused: stack_import_unresolved: refused",
			"stack_import_unresolved",
		},
		// A site only the BACKEND's same-named helper declares is not a flow
		// site and never becomes a stage, even though it is a real identifier.
		{"coding/NativeCodingError/source_refused", "source_refused: workspace_owner_mismatch: refused", "unnamed"},
		// A runtime that names no site says so, rather than inventing one.
		{"coding/Error/invalid_receipt", "", "unnamed"},
		{"coding/Error/invalid_receipt", "Fast receipt build does not identify the current revision", "unnamed"},
		{
			"coding/Error/invalid_receipt",
			"invalid_receipt: Fast receipt build does not identify the current revision",
			"unnamed",
		},
		// NEGATIVES. Every one of these is syntactically a lower-case
		// identifier of 48 characters or fewer, and none is declared by any
		// producer, so none may become a label.
		{"coding/Error/execution", strings.Repeat("a", 48) + ": still not a site", "unnamed"},
		{"coding/Error/execution", "aaaaaaaa: not a site", "unnamed"},
		{"coding/Error/execution", "secret_bearer_token_value: not a site", "unnamed"},
		{"coding/Error/execution", "sk_live_abcdefghijklmnop: not a site", "unnamed"},
		{"coding/Error/execution", "password: hunter2", "unnamed"},
		{"coding/Error/execution", "execution: sk_live_abcdefghijklmnop: under the code", "unnamed"},
		// Nothing outside the declared set is a site: not a path, not an id,
		// not a URL, not a credential header and not prose with a colon.
		{"coding/Error/execution", "execution: /tmp/sm-p-AbC123: no such file", "unnamed"},
		{"coding/Error/execution", "Authorization: Bearer sk-live-0123456789", "unnamed"},
		{"coding/Error/execution", "https://api.github.com/repos/o/r: 404", "unnamed"},
		{"coding/Error/execution", "4a9f1c2e-0000-4000-8000-00000000abcd: refused", "unnamed"},
		{"coding/Error/execution", "Planning memory: could not be gathered", "unnamed"},
		{"coding/Error/execution", strings.Repeat("a", 400) + ": long", "unnamed"},
	} {
		require.Equal(t, tc.stage, mythicalFailedStage(tc.tag, tc.message), tc.message)
	}
}

// The allowlist is the product's own declarations, not a second list that can
// drift from them: it is exactly planningSites plus every declared
// sourceRefusal site. A new site added to a flow without being declared here
// would be reported "unnamed", and this test says so instead of letting the
// record go quiet.
func TestMythicalFailedStageSitesMatchTheirSourceDeclarations(t *testing.T) {
	root := flowSourceRoot(t)
	declared := map[string]struct{}{}

	planning, err := os.ReadFile(filepath.Join(root, "flows", "coding", "planning-memory.ts"))
	require.NoError(t, err)
	block := regexp.MustCompile(`(?s)export const planningSites = \[(.*?)\] as const`).FindSubmatch(planning)
	require.Len(t, block, 2, "planningSites is declared in flows/coding/planning-memory.ts")
	for _, site := range regexp.MustCompile(`"([a-z_]+)"`).FindAllSubmatch(block[1], -1) {
		declared[string(site[1])] = struct{}{}
	}
	require.NotEmpty(t, declared)

	// Only a repository flow's own refusal can reach a flow's typed failure
	// message. The backend has a same-named helper that records to its log;
	// its sites are deliberately out of scope here and out of the allowlist.
	refusal := regexp.MustCompile(`sourceRefusal\(\s*"([a-z_]+)"`)
	require.NoError(t, filepath.WalkDir(filepath.Join(root, "flows"), func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			if entry != nil && entry.IsDir() && entry.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return err
		}
		if !strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".test.ts") {
			return nil
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, site := range refusal.FindAllSubmatch(body, -1) {
			declared[string(site[1])] = struct{}{}
		}
		return nil
	}))

	require.Equal(t, sorted(declared), sorted(mythicalFailedStageSites),
		"the stage allowlist must be exactly the sites the flows declare")
}

func sorted(set map[string]struct{}) []string {
	names := make([]string, 0, len(set))
	for name := range set {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// flowSourceRoot walks up to the directory holding the flow declarations.
func flowSourceRoot(t *testing.T) string {
	t.Helper()
	directory, err := os.Getwd()
	require.NoError(t, err)
	for depth := 0; depth < 8; depth++ {
		if _, err := os.Stat(filepath.Join(directory, "flows", "coding", "planning-memory.ts")); err == nil {
			return directory
		}
		directory = filepath.Dir(directory)
	}
	t.Fatal("repository root not found above the package directory")
	return ""
}

// The record carries the fault, the tag and the stage, each a registry
// identifier or a declared site; the projection's own request_outcome is
// unchanged by it, and no part of the failure's text reaches it.
func TestMythicalRunFailedRecordsTheStageAndChangesNoOutcome(t *testing.T) {
	record := func(run *flowruntime.Run, flow string) (string, string) {
		buffer := &bytes.Buffer{}
		previous := slog.Default()
		slog.SetDefault(slog.New(slog.NewJSONHandler(buffer, &slog.HandlerOptions{Level: slog.LevelWarn})))
		defer slog.SetDefault(previous)
		outcome := mythicalFailedOutcome(flowdispatch.ProjectionUpdate{
			Checkpoint: flowdispatch.RuntimeCheckpoint{FlowID: flow, Run: run},
		})
		return outcome, buffer.String()
	}

	outcome, logged := record(&flowruntime.Run{
		Status:         "failed",
		FailureFault:   "infra",
		FailureTag:     "coding/Error/execution",
		FailureMessage: "execution: native_snapshot_unavailable: Native snapshot could not run (unknown): ENOENT /tmp/sm-p-XXXXXX",
	}, "todo")
	require.Equal(t, mythicalOutage+"infra: coding/Error/execution", outcome)

	var fields struct {
		Message string `json:"msg"`
		Flow    string `json:"flow"`
		Fault   string `json:"fault"`
		Tag     string `json:"tag"`
		Stage   string `json:"stage"`
	}
	line := strings.TrimSpace(logged)
	require.NotEmpty(t, line, "a registered failure records its stage")
	require.NoError(t, json.Unmarshal([]byte(strings.Split(line, "\n")[0]), &fields))
	require.Equal(t, "mythical.run_failed", fields.Message)
	require.Equal(t, "todo", fields.Flow)
	require.Equal(t, "infra", fields.Fault)
	require.Equal(t, "coding/Error/execution", fields.Tag)
	require.Equal(t, "native_snapshot_unavailable", fields.Stage)
	// No part of the failure's own text reaches the record.
	require.NotContains(t, logged, "/tmp/sm-p-")
	require.NotContains(t, logged, "ENOENT")

	// A runtime answer this build does not declare never becomes a label: not
	// an unregistered fault class, not a flow id carrying prose or a secret,
	// and not a tag that is not a registry identifier.
	_, logged = record(&flowruntime.Run{
		Status:         "failed",
		FailureFault:   "Authorization: Bearer sk-live-0123",
		FailureTag:     "unexpected failure for owner alice@example.com",
		FailureMessage: "sk_live_abcdefghijklmnop: not a site",
	}, "todo for repo o/r with token sk-live-9")
	require.Contains(t, logged, `"fault":"unregistered"`)
	require.Contains(t, logged, `"tag":"unregistered"`)
	require.Contains(t, logged, `"flow":"unregistered"`)
	require.Contains(t, logged, `"stage":"unnamed"`)
	require.NotContains(t, logged, "sk-live")
	require.NotContains(t, logged, "sk_live")
	require.NotContains(t, logged, "alice@example.com")
}
