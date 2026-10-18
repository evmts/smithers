package modelhost

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
)

// An admitted model test whose owner is over the model host cap fails its
// job with the cap's own answer, so the receipt the app polls says why and
// when to retry instead of the generic invalid-request failure.
func TestModelTestJobFailsWithTheOwnerCapAnswerPostgres(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	ctx := t.Context()
	owner, err := db.New(pool).CreateUser(ctx, db.CreateUserParams{Username: "busy-probe-owner", LowerUsername: "busy-probe-owner"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO self_host_owners(user_id) VALUES($1)`, owner.ID)
	require.NoError(t, err)
	models := OwnerModels{Pool: pool, Tester: fixtureTester(func(context.Context, int64, json.RawMessage) (json.RawMessage, error) {
		return nil, &ports.ModelHostsBusy{Limit: 2}
	})}

	const requestID = "busy-probe-0001"
	request := httptest.NewRequest(http.MethodPost, "/api/model/test", strings.NewReader(`{"requestId":"`+requestID+`","model":{"id":"writer","protocol":"openai-chat","modelId":"fixture","credential":"TEST_KEY"}}`))
	request = request.WithContext(middleware.ContextWithAuthInfo(request.Context(), &middleware.AuthInfo{User: &db.User{ID: owner.ID}}))
	response := httptest.NewRecorder()
	models.Test(response, request)
	require.Equal(t, http.StatusAccepted, response.Code, response.Body.String())

	workerCtx, stop := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- models.RunModelTests(workerCtx) }()
	store, err := jobs.NewStore(pool)
	require.NoError(t, err)
	var op jobs.Operation
	require.Eventually(t, func() bool {
		op, err = store.GetByRequest(ctx, modelTestScope(owner.ID), ModelTestOperation, requestID)
		return err == nil && op.State == jobs.StateFailed
	}, 20*time.Second, 20*time.Millisecond)
	stop()
	require.NoError(t, <-done)
	require.JSONEq(t, ownerCapModelTestResult, string(op.TerminalReceipt))
}
