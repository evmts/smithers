package services

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
)

func TestWorkflowRunService_CancelRun_InvokedFlowCommitStatus(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name          string
		plane         string
		trigger       string
		sha           string
		statusError   error
		wantErrorLog  bool
		wantPublished bool
	}{
		{name: "invoked file flow has no commit status", plane: WorkflowRunPlaneFlow, trigger: InvokeTriggerEvent, statusError: pgx.ErrNoRows},
		{name: "whitespace commit is absent", plane: WorkflowRunPlaneFlow, trigger: InvokeTriggerEvent, sha: " \t\n", statusError: pgx.ErrNoRows},
		{name: "existing status still updates", plane: WorkflowRunPlaneFlow, trigger: InvokeTriggerEvent, wantPublished: true},
		{name: "commit backed flow missing status remains an error", plane: WorkflowRunPlaneFlow, trigger: InvokeTriggerEvent, sha: strings.Repeat("a", 40), statusError: pgx.ErrNoRows, wantErrorLog: true},
		{name: "sandbox CI missing status remains an error", plane: WorkflowRunPlaneSandbox, trigger: "push", statusError: pgx.ErrNoRows, wantErrorLog: true},
		{name: "legacy CI missing status remains an error", trigger: "workflow_dispatch", statusError: pgx.ErrNoRows, wantErrorLog: true},
		{name: "non invocation flow missing status remains an error", plane: WorkflowRunPlaneFlow, trigger: "workflow_dispatch", statusError: pgx.ErrNoRows, wantErrorLog: true},
		{name: "storage failure remains an error", plane: WorkflowRunPlaneFlow, trigger: InvokeTriggerEvent, statusError: errors.New("commit status store unavailable"), wantErrorLog: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &cancelRunQuerierMock{
				getRunFn: func(_ context.Context, arg db.GetWorkflowRunParams) (db.WorkflowRun, error) {
					return db.WorkflowRun{ID: arg.ID, RepositoryID: arg.RepositoryID, Status: "running",
						ExecutionPlane: tc.plane, TriggerEvent: tc.trigger, TriggerCommitSha: tc.sha,
						CheckRunID: pgtype.Int8{Int64: 123, Valid: true}}, nil
				},
			}
			statusQueries := &mockCommitStatusQuerier{
				updateByWorkflowRunFn: func(_ context.Context, arg db.UpdateLatestCommitStatusByWorkflowRunIDParams) (db.CommitStatus, error) {
					if tc.statusError != nil {
						return db.CommitStatus{}, tc.statusError
					}
					status := sampleCommitStatus()
					status.RepositoryID = 42
					status.WorkflowRunID = arg.WorkflowRunID
					status.Status = arg.Status
					status.Description = arg.Description
					return status, nil
				},
			}
			dispatcher := &mockCommitStatusDispatcher{}
			// Use the actual status service to distinguish its typed missing-row error from storage failures.
			writer := NewCommitStatusService(statusQueries, WithCommitStatusWebhookDispatcher(dispatcher))
			checks := &mockWorkflowRunCheckRunService{}
			svc := NewWorkflowRunService(q, WithWorkflowRunCommitStatusWriter(writer), WithWorkflowRunGitHubCheckRunService(checks),
				WithWorkflowRunGitHubInstallationResolver(&mockRunnerInstallationResolver{
					resolveFn: func(context.Context, int64, int64, string, string) (int64, error) { return 99, nil },
				}))

			var logs bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&logs, nil))
			var cancelErr error
			middleware.InjectLogger(logger)(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
				cancelErr = svc.CancelRun(request.Context(), 42, 7)
			})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/cancel", nil))
			require.NoError(t, cancelErr)
			assert.Equal(t, []int64{7}, q.cancelRunCalls)
			assert.Equal(t, []int64{7}, q.cancelTaskCalls)
			assert.Len(t, q.updateAgentTokenCalls, 1, "cancellation still revokes run credentials")
			require.Equal(t, 1, statusQueries.updateCallCount, "an existing status must still be updated")
			assert.Equal(t, int64(7), statusQueries.lastUpdateArg.WorkflowRunID.Int64)
			assert.Equal(t, "cancelled", statusQueries.lastUpdateArg.Status)
			assert.Equal(t, "Workflow was cancelled", statusQueries.lastUpdateArg.Description)
			assert.Equal(t, tc.wantErrorLog, strings.Contains(logs.String(), "failed to update commit status for cancelled workflow run"))
			if tc.wantErrorLog {
				assert.Contains(t, logs.String(), `"workflow_run_id":7`)
				assert.Contains(t, logs.String(), `"repository_id":42`)
			}
			if tc.wantPublished {
				require.Len(t, dispatcher.calls, 1, "existing status publication remains intact")
			} else {
				assert.Empty(t, dispatcher.calls)
			}
			require.Len(t, checks.updateCalls, 1, "a missing commit status cannot suppress GitHub check completion")
			assert.Equal(t, "completed", checks.updateCalls[0].update.Status)
			assert.Equal(t, "cancelled", checks.updateCalls[0].update.Conclusion)
		})
	}
}
