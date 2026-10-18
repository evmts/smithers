package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// modelHostClockStore gives each model host bucket its own clock. A test can
// open new minute windows while the hour bucket's own refill (300 an hour is
// 5 a minute) stands still, so the hour bucket's capacity is counted exactly
// and no assertion depends on runner scheduling.
type modelHostClockStore struct {
	mockRateLimitStore
	minute, hour time.Time
}

func (s *modelHostClockStore) ConsumeSearchRateLimitToken(ctx context.Context, arg db.ConsumeSearchRateLimitTokenParams) (db.ConsumeSearchRateLimitTokenRow, error) {
	switch arg.Scope {
	case ModelHostMinuteRateLimitScope:
		arg.NowAt = s.minute
	case ModelHostHourRateLimitScope:
		arg.NowAt = s.hour
	}
	return s.mockRateLimitStore.ConsumeSearchRateLimitToken(ctx, arg)
}

func newModelHostClockStore() *modelHostClockStore {
	now := time.Now().UTC()
	return &modelHostClockStore{minute: now, hour: now}
}

func modelHostStarter(store SearchRateLimitStore) func(userID int64) *httptest.ResponseRecorder {
	handler := ModelHostRateLimit(store)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	return func(userID int64) *httptest.ResponseRecorder {
		// One shared address: the bucket belongs to the user, not the IP.
		req := withTestUser(httptest.NewRequest(http.MethodPost, "/api/model/stream", nil), userID)
		req.RemoteAddr = "203.0.113.20:12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
}

func requireModelHostRefusal(t *testing.T, rec *httptest.ResponseRecorder, limit int) {
	t.Helper()
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	assert.NotEmpty(t, rec.Header().Get("Retry-After"))
	var payload map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload), rec.Body.String())
	assert.Equal(t, "rate_limit_exceeded", payload["code"])
	assert.Equal(t, "rate limit exceeded", payload["message"])
	assert.EqualValues(t, limit, payload["limit"])
	assert.EqualValues(t, 0, payload["remaining"])
}

// Ten model host starts a minute per user (Security d-kmefmv): the eleventh in
// the same minute is refused, and another user behind the same address still
// starts one.
func TestModelHostRateLimit_RefusesTheEleventhStartInAMinutePerUser(t *testing.T) {
	t.Parallel()

	store := newModelHostClockStore()
	start := modelHostStarter(store)
	for i := 0; i < 10; i++ {
		require.Equal(t, http.StatusNoContent, start(7).Code, "start %d", i+1)
	}
	rec := start(7)
	requireModelHostRefusal(t, rec, 10)
	assert.Equal(t, "10", rec.Header().Get("X-RateLimit-Limit"))

	require.Equal(t, http.StatusNoContent, start(8).Code, "another user has its own budget")
	assert.Contains(t, store.keysSeen, "model_host_minute|user:7")
	assert.Contains(t, store.keysSeen, "model_host_hour|user:7")
	assert.Contains(t, store.keysSeen, "model_host_minute|user:8")
}

// Three hundred model host starts an hour per user: a user who fills thirty
// fresh minute windows is refused at the 301st start by the hour bucket, even
// though the minute bucket has room.
func TestModelHostRateLimit_HourBucketRefusesThe301stStart(t *testing.T) {
	t.Parallel()

	store := newModelHostClockStore()
	start := modelHostStarter(store)
	for window := 0; window < 30; window++ {
		for i := 0; i < 10; i++ {
			require.Equal(t, http.StatusNoContent, start(7).Code, "start %d", window*10+i+1)
		}
		// Two minutes refill the minute bucket to its cap, whatever the
		// float rounding of one minute's refill.
		store.minute = store.minute.Add(2 * time.Minute)
	}
	rec := start(7)
	requireModelHostRefusal(t, rec, 300)
	assert.Equal(t, "300", rec.Header().Get("X-RateLimit-Limit"))

	require.Equal(t, http.StatusNoContent, start(8).Code, "another user has its own hour budget")
}
