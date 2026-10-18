package compose

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

func TestGuestLimitsAndPublicVisibility(t *testing.T) {
	for _, code := range []string{"guest_request_cap", "guest_daily_cap", "guest_window_cap", "guest_ip_cap", "guest_window_closed"} {
		t.Run(code, func(t *testing.T) {
			f := newGuestFixture(t, config.AuthModeMultitenant, nil)
			switch code {
			case "guest_request_cap":
				f.handler.Config.RequestNanos = 1
			case "guest_daily_cap":
				f.handler.Config.DailyNanos = 1
			case "guest_window_cap":
				f.handler.Config.WindowNanos = 1
			case "guest_ip_cap":
				f.handler.Config.RequestsPerIP = 1
				require.Equal(t, 200, f.chat(uuid.NewString()).Code)
			case "guest_window_closed":
				f.handler.Now = func() time.Time { return time.Now().Add(2 * time.Hour) }
			}
			before := f.calls.Load()
			result := f.chat(uuid.NewString())
			require.Equal(t, 429, result.Code, result.Body.String())
			require.Contains(t, result.Body.String(), code)
			require.Equal(t, before, f.calls.Load())
		})
	}
	t.Run("private", func(t *testing.T) {
		f := newGuestFixture(t, config.AuthModeMultitenant, nil)
		_, err := f.pool.Exec(context.Background(), `UPDATE repositories SET is_public=false`)
		require.NoError(t, err)
		require.Equal(t, 503, f.chat(uuid.NewString()).Code)
		require.Zero(t, f.calls.Load())
	})
}

func TestGuestOriginAndOperatorBoundary(t *testing.T) {
	for _, mode := range []string{config.AuthModeSelfHosted, config.AuthModeMultitenant} {
		t.Run(mode, func(t *testing.T) {
			f := newGuestFixture(t, mode, nil)
			request := httptest.NewRequest("POST", "/api/repos/sponsor/public/guest/chat", strings.NewReader(`{}`))
			request.RemoteAddr = "192.0.2.1:1234"
			request.AddCookie(f.cookie)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", "https://untrusted.example")
			response := httptest.NewRecorder()
			f.router.ServeHTTP(response, request)
			require.Equal(t, http.StatusForbidden, response.Code)
			require.Zero(t, f.calls.Load())
			response = f.request("PUT", "/api/admin/guest", map[string]bool{"disabled": false}, "")
			require.NotEqual(t, 200, response.Code, "guest cookie is never an operator credential")
		})
	}
}

func TestGuestDiagnosticsExcludePayloadCredentialsAndRawIP(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	defer slog.SetDefault(previous)
	f := newGuestFixture(t, config.AuthModeMultitenant, nil)
	result := f.chat(uuid.NewString())
	require.Equal(t, 200, result.Code)
	log := output.String()
	for _, secret := range []string{"A repository question", "Guest answer", "fixture-provider-key", f.cookie.Value, "192.0.2.1", "Reply in the repository's language."} {
		require.NotContains(t, log, secret)
	}
	for _, field := range []string{"landing_id", "interaction_id", "run_id", "reservation_id", "ip_hash", "duration_ms", "reserved", "completed"} {
		require.Contains(t, log, field)
	}
}

func TestGuestRepositoryDeletionCannotResetSpendPool(t *testing.T) {
	f := newGuestFixture(t, config.AuthModeMultitenant, nil)
	require.Equal(t, 200, f.chat(uuid.NewString()).Code)
	ctx := context.Background()
	var bound, charged, sponsor int64
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT bound_nanos,charged_nanos,sponsor_id FROM guest_reservations`).Scan(&bound, &charged, &sponsor))
	require.Positive(t, charged)
	f.handler.Config.DailyNanos = bound
	// Preserve the product's durable repository-deletion fence, just as the
	// real deletion service does; this fixture has no physical source storage.
	err := pgx.BeginFunc(ctx, f.pool, func(tx pgx.Tx) error {
		token := strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", "")
		if _, err := tx.Exec(ctx, `INSERT INTO repository_storage_operations(repository_id,operation_type,token,storage_route_key,source_owner,source_repo,source_user_id) SELECT id,'delete',$1,'s1','sponsor',name,user_id FROM repositories`, token); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `SELECT set_config('smithers.repository_storage_operation_token',$1,true)`, token); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM repositories`); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM repository_storage_operations WHERE token=$1`, token)
		return err
	})
	require.NoError(t, err)
	var retained int64
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT COALESCE(sum(charged_nanos),0)::bigint FROM guest_reservations`).Scan(&retained))
	require.Equal(t, charged, retained)
	_, err = db.New(f.pool).CreateRepo(ctx, db.CreateRepoParams{UserID: pgtype.Int8{Int64: sponsor, Valid: true}, Name: "public", LowerName: "public", IsPublic: true, DefaultBookmark: "main"})
	require.NoError(t, err)
	f.cookie = nil
	boot := f.request("GET", "/api/repos/sponsor/public/guest", nil, "")
	require.Equal(t, 200, boot.Code)
	f.cookie = boot.Result().Cookies()[0]
	refused := f.chat(uuid.NewString())
	require.Equal(t, 429, refused.Code, refused.Body.String())
	require.Contains(t, refused.Body.String(), "guest_daily_cap")
	require.Equal(t, int64(1), f.calls.Load())
}
