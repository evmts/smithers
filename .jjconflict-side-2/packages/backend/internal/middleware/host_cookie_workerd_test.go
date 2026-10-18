package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

// TestHostCookieWorkerdBrowser crosses Chromium -> deployed edge in workerd ->
// the real AuthLoader. No cookie-jar emulation can establish a __Host- proof.
func TestHostCookieWorkerdBrowser(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	require.NoError(t, err)
	const sessionKey = "browser-fixture-session"
	q := &mockAuthLoaderQuerier{
		getAuthSessionBySessionKeyFn: func(_ context.Context, key string) (db.AuthSession, error) {
			if key != sessionKey {
				return db.AuthSession{}, pgx.ErrNoRows
			}
			return db.AuthSession{SessionKey: key, UserID: 7, ExpiresAt: time.Now().Add(24 * time.Hour)}, nil
		},
		getUserByIDFn: func(context.Context, int64) (db.User, error) {
			return db.User{ID: 7, Username: "owner", IsActive: true}, nil
		},
	}
	probe := AuthLoader(q, config.AuthConfig{
		// Deliberately retain both old deployment overrides: neither may weaken
		// the hosted boundary or keep the legacy cookie usable.
		SessionCookieName: "smithers_session", CookieSecure: false,
		SessionRefreshWindow: "0h",
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]bool{"authenticated": UserFromContext(r.Context()) != nil})
	}))
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/fixture/sign-in" {
			http.SetCookie(w, &http.Cookie{Name: config.DefaultSessionCookieName, Value: sessionKey, Path: "/", Secure: true, HttpOnly: true})
			w.WriteHeader(http.StatusNoContent)
			return
		}
		probe.ServeHTTP(w, r)
	}))
	defer backend.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	bundle := exec.CommandContext(ctx, "bun", "build", "apps/server/src/edge.ts", "--target=browser")
	bundle.Dir = root
	script, err := bundle.Output()
	require.NoError(t, err)
	proof := exec.CommandContext(ctx, "node", "apps/server/scripts/cutover/host-cookie-workerd.mjs")
	proof.Dir = root
	proof.Env = append(os.Environ(), "SMITHERS_COOKIE_PROOF_BACKEND="+backend.URL)
	proof.Stdin = bytes.NewReader(script)
	output, err := proof.CombinedOutput()
	require.NoError(t, err, "%s", output)
	require.Contains(t, string(output), "host cookie browser/workerd/backend proof passed")
}

func TestHostCookieLegacyRejected(t *testing.T) {
	for _, name := range []string{"smithers_session", "smithers_local_session", "custom_session"} {
		t.Run(name, func(t *testing.T) {
			q := &mockAuthLoaderQuerier{}
			h := AuthLoader(q, config.AuthConfig{SessionCookieName: name, CookieSecure: false})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Nil(t, UserFromContext(r.Context()))
				w.WriteHeader(http.StatusNoContent)
			}))
			r := httptest.NewRequest(http.MethodGet, "https://smithers.sh/api/user", nil)
			r.AddCookie(&http.Cookie{Name: name, Value: "legacy"})
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			require.Equal(t, http.StatusNoContent, w.Code)
			require.Zero(t, q.getAuthSessionBySessionKeyHit)
		})
	}
}

func TestHostCookieSelfhostHTTP(t *testing.T) {
	for _, name := range []string{config.LocalSessionCookieName, config.DefaultSessionCookieName, "smithers_session"} {
		t.Run(name, func(t *testing.T) {
			q := &mockSingleOwnerAuthLoaderQuerier{
				mockAuthLoaderQuerier: &mockAuthLoaderQuerier{
					getAuthSessionBySessionKeyFn: func(_ context.Context, key string) (db.AuthSession, error) {
						return db.AuthSession{SessionKey: key, UserID: 7, ExpiresAt: time.Now().Add(365 * 24 * time.Hour)}, nil
					},
					getUserByIDFn: func(context.Context, int64) (db.User, error) {
						return db.User{ID: 7, Username: "owner", IsActive: true}, nil
					},
				},
				owner: db.User{ID: 7, Username: "owner", IsActive: true},
			}
			h := EffectiveOrigin(FixedOrigins("http://localhost:4000"))(AuthLoader(q, config.AuthConfig{Mode: "selfhost"})(RequireAuth(CSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })))))
			r := httptest.NewRequest(http.MethodPost, "http://localhost:4000/api/secrets", nil)
			r.RemoteAddr = "127.0.0.1:1234"
			r.Header.Set("Origin", "http://localhost:4000")
			r.Header.Set("X-CSRF-Token", "csrf")
			r.AddCookie(&http.Cookie{Name: name, Value: "fixture-session"})
			r.AddCookie(&http.Cookie{Name: LocalCSRFCookieName, Value: "csrf"})
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if name == config.LocalSessionCookieName {
				require.Equal(t, http.StatusNoContent, w.Code)
			} else {
				require.Equal(t, http.StatusUnauthorized, w.Code)
			}
		})
	}
}
