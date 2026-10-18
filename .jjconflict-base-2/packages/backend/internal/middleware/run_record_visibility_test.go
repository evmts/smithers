package middleware

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

type runVisibilityStub struct {
	mockRepoContextQuerier
	repository    db.Repository
	repositoryErr error
	visible       bool
	err           error
	ids           [][2]int64
}

func (s *runVisibilityStub) MayViewWorkflowRun(_ context.Context, run, viewer int64) (bool, error) {
	s.ids = append(s.ids, [2]int64{run, viewer})
	return s.visible, s.err
}

func (s *runVisibilityStub) WorkflowRunRepository(context.Context, int64) (db.Repository, error) {
	return s.repository, s.repositoryErr
}

func TestRunRecordVisibilityBoundary(t *testing.T) {
	for _, row := range []struct {
		name, path             string
		viewer                 int64
		visible, skip          bool
		err                    error
		repositoryErr          error
		private, permissionErr bool
		status                 int
	}{
		{name: "owner", path: "/api/repos/o/r/runs/42", viewer: 7, visible: true, status: 204},
		{name: "member refused before handler", path: "/api/repos/o/r/actions/runs/42/artifacts/x/download", viewer: 8, status: 404},
		{name: "visitor", path: "/api/repos/o/r/workflow/runs/42/artifacts", status: 404},
		{name: "missing run", path: "/api/runs/42/background-status", viewer: 7, status: 404},
		{name: "numeric flow status", path: "/api/flows/runs/42", status: 404},
		{name: "leading zero", path: "/api/repos/o/r/workflows/runs/042/events", status: 404},
		{name: "signed integer", path: "/api/repos/o/r/runs/+42", status: 404},
		{name: "database failure", path: "/api/repos/o/r/runs/42", err: errors.New("database failed"), status: 500},
		{name: "repository disappears", path: "/api/repos/o/r/runs/42", viewer: 7, visible: true, repositoryErr: pgx.ErrNoRows, status: 404},
		{name: "repository lookup fails", path: "/api/repos/o/r/runs/42", viewer: 7, visible: true, repositoryErr: errors.New("database failed"), status: 500},
		{name: "unreadable ordinary run", path: "/api/repos/o/r/runs/42", viewer: 7, visible: true, private: true, status: 404},
		{name: "repository permission fails", path: "/api/repos/o/r/runs/42", viewer: 7, visible: true, permissionErr: true, status: 500},
		{name: "admin unchanged", path: "/api/admin/runs/42", skip: true, status: 204},
		{name: "worker unchanged", path: "/api/internal/runs/42/artifacts", skip: true, status: 204},
		{name: "list filtered in SQL", path: "/api/repos/o/r/runs", skip: true, status: 204},
		{name: "definition list", path: "/api/repos/o/r/workflows/42/runs", skip: true, status: 204},
		{name: "UUID jobs unchanged", path: "/api/flows/runs/5d530335-2138-4456-8a5a-16b56bc509e1", skip: true, status: 204},
		{name: "invalid ID", path: "/api/repos/o/r/runs/no", skip: true, status: 204},
		{name: "overflow", path: "/api/repos/o/r/runs/9999999999999999999999", skip: true, status: 204},
		{name: "nonpositive", path: "/api/repos/o/r/runs/0", skip: true, status: 204},
		{name: "unrelated path", path: "/api/repos/o/r/issues/42", skip: true, status: 204},
	} {
		t.Run(row.name, func(t *testing.T) {
			store := &runVisibilityStub{visible: row.visible, err: row.err, repositoryErr: row.repositoryErr, repository: db.Repository{ID: 1, IsPublic: !row.private, UserID: pgtype.Int8{Int64: 7, Valid: true}}}
			if row.private || row.permissionErr {
				store.repository.UserID = pgtype.Int8{Int64: 99, Valid: true}
			}
			if row.permissionErr {
				store.getCollaboratorPermissionForRepoUserFn = func(context.Context, db.GetCollaboratorPermissionForRepoUserParams) (string, error) {
					return "", errors.New("permission query failed")
				}
			}
			req := httptest.NewRequest(http.MethodGet, row.path, nil)
			if row.viewer > 0 {
				req = req.WithContext(context.WithValue(req.Context(), UserContextKey, &db.User{ID: row.viewer}))
			}
			rec := httptest.NewRecorder()
			called := false
			RunRecordVisibility(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) })).ServeHTTP(rec, req)
			require.Equal(t, row.status, rec.Code)
			require.Equal(t, row.status == 204, called)
			if row.skip {
				require.Empty(t, store.ids)
			} else {
				require.Equal(t, [][2]int64{{42, row.viewer}}, store.ids)
			}
		})
	}
	t.Run("uncomposed test router", func(t *testing.T) {
		rec := httptest.NewRecorder()
		RunRecordVisibility(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/repos/o/r/runs/42", nil))
		require.Equal(t, 204, rec.Code)
	})
}

func TestRunRecordViewerIdentity(t *testing.T) {
	person := &db.User{ID: 7, UserType: "individual"}
	for _, row := range []struct {
		name     string
		info     *AuthInfo
		fallback *db.User
		want     int64
	}{
		{"visitor", nil, nil, 0},
		{"person", &AuthInfo{User: person}, nil, 7},
		{"personal token", &AuthInfo{User: person, IsTokenAuth: true}, nil, 7},
		{"owner-backed guest", &AuthInfo{User: person, IsTokenAuth: true, TokenSystemIssued: true}, nil, 0},
		{"bot", &AuthInfo{User: &db.User{ID: 7, UserType: "bot"}}, nil, 0},
		{"legacy person", nil, person, 7},
		{"legacy service", nil, &db.User{ID: 7, UserType: "service"}, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			ctx := context.Background()
			if row.fallback != nil {
				ctx = context.WithValue(ctx, UserContextKey, row.fallback)
			}
			if row.info != nil {
				ctx = ContextWithAuthInfo(ctx, row.info)
			}
			require.Equal(t, row.want, RunRecordViewerID(ctx))
		})
	}
}
