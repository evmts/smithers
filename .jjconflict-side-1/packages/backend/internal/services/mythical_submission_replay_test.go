package services

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/stretchr/testify/require"
)

func TestInstalledLaneSubmissionReconcilesClosedTodo(t *testing.T) {
	o, session := newTodoAdmission(t)
	o.service.SetTodoFlow(func(context.Context, int64, string) (string, error) { return todoPinOne, nil })
	id := uuidString(o.fileTodo(session, "closed-submission-replay").ID)
	o.wake()
	o.projectTodo(o.launcher.last("todo"), "waiting", "current-run", todoPinOne, "")
	item := o.byID(id)
	_, err := o.pool.Exec(t.Context(), `INSERT INTO workspaces(id,repository_id,user_id,status) VALUES($1,$2,$3,'running')`, item.WorkspaceID, o.repoID, o.userID)
	require.NoError(t, err)
	candidate := o.laneResult(item.WorkspaceID, item.BaseCommit, map[string]string{"JOURNEY.md": "Hello, reader.\n"}, "Greet reader")
	submission := MythicalLaneSubmission{WorkspaceID: item.WorkspaceID, Base: item.BaseCommit, Source: candidate, RequestRunID: "current-run", Summary: "Greet reader", Plan: json.RawMessage(`{"changes":[{"title":"Greet","atoms":[{"changeId":null,"message":"Greet"}],"checks":[{"id":"test","target":"test","flow":"checks/test","flowDigest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","tier":"fast","required":true}]}]}`)}
	user, err := db.New(o.pool).GetUserByID(t.Context(), o.userID)
	require.NoError(t, err)
	scopes := strings.Join([]string{"write:repository", middleware.RepositoryRestrictionScope(o.repoID), middleware.WorkspaceRestrictionScope(item.WorkspaceID), middleware.AgentSessionRestrictionScope("current-run")}, ",")
	ctx := registerTestInstallCredential(t, o.pool, middleware.ContextWithAuthInfo(t.Context(), &middleware.AuthInfo{User: &user, IsTokenAuth: true, TokenSystemIssued: true, RawScopes: scopes, Scopes: middleware.ParseTokenScopes(scopes)}), o.repoID)
	o.service.installAuthorization = true
	_, err = o.service.SubmitLane(ctx, o.repoID, o.userID, submission)
	require.NoError(t, err)
	for _, state := range []string{"landed", "cancelled", "rejected", "declined", "skipped"} {
		t.Run(state, func(t *testing.T) {
			item := o.byID(id)
			item.State = state
			_, err := o.service.queries().SaveMythicalItem(ctx, item)
			require.NoError(t, err)
			before := o.byID(id)
			receipt, err := o.service.SubmitLane(ctx, o.repoID, o.userID, submission)
			require.NoError(t, err)
			require.Equal(t, MythicalLaneReceipt{ItemID: id, State: state, Source: candidate}, receipt)
			require.Equal(t, before, o.byID(id), "reconciliation must not reopen or mutate a closed TODO")
			for _, field := range []string{"run", "base"} {
				other := submission
				if field == "run" {
					other.RequestRunID = "another-run"
				} else {
					other.Base = strings.Repeat("b", 40)
				}
				_, err = o.service.SubmitLane(ctx, o.repoID, o.userID, other)
				require.Error(t, err, "a receipt still requires the original attempt binding")
			}
			other := submission
			other.Source = strings.Repeat("a", 40)
			_, err = o.service.SubmitLane(ctx, o.repoID, o.userID, other)
			require.ErrorContains(t, err, "TODO is closed")
			require.Equal(t, before, o.byID(id))
		})
	}
}
