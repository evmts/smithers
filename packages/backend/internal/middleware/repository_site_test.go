package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/stretchr/testify/require"
)

type siteAudienceQueries struct {
	*mockAuthLoaderQuerier
	audience RepositorySiteSession
	missing  bool
}

func (q siteAudienceQueries) GetInstallSetting(context.Context, string) (db.InstallSetting, error) {
	if q.missing {
		return db.InstallSetting{}, pgx.ErrNoRows
	}
	b, e := json.Marshal(q.audience)
	return db.InstallSetting{Value: b}, e
}
func TestRepositorySiteSessionAudienceAndAPIScope(t *testing.T) {
	const raw = RepositorySiteSessionPrefix + "fixture"
	binding := RepositorySiteBinding{Host: "manual.example", RepositoryID: 1, Owner: "first", Name: "manual", Generation: "binding-1"}
	base := RepositorySiteSession{Host: binding.Host, RepositoryID: 1, UserID: 7, Expires: time.Now().Add(time.Hour), BindingToken: binding.Generation}
	query := func(audience RepositorySiteSession, missing bool) siteAudienceQueries {
		return siteAudienceQueries{audience: audience, missing: missing, mockAuthLoaderQuerier: &mockAuthLoaderQuerier{getAuthSessionBySessionKeyFn: func(_ context.Context, key string) (db.AuthSession, error) {
			return db.AuthSession{SessionKey: key, UserID: 7, ExpiresAt: time.Now().Add(365 * 24 * time.Hour)}, nil
		}, getUserByIDFn: func(context.Context, int64) (db.User, error) {
			return db.User{ID: 7, Username: "owner", IsActive: true}, nil
		}}}
	}
	for _, tc := range []struct {
		name, path, cookie string
		binding            *RepositorySiteBinding
		audience           RepositorySiteSession
		missing            bool
		want               int
	}{
		{"own repository", "/api/repos/first/manual", raw, &binding, base, false, 204},
		{"another repository", "/api/repos/other/private", raw, &binding, base, false, 403},
		{"account token mint", "/api/auth/tokens", raw, &binding, base, false, 403},
		{"personal conversations", "/api/conversations/private", raw, &binding, base, false, 403},
		{"dot segment escape", "/api/repos/first/manual/../other", raw, &binding, base, false, 403},
		{"copied to apex", "/api/user", raw, nil, base, false, 401},
		{"global cookie on site", "/api/repos/first/manual", "global-session", &binding, base, false, 401},
		{"missing audience", "/api/repos/first/manual", raw, &binding, base, true, 401},
		{"wrong host", "/api/repos/first/manual", raw, &binding, RepositorySiteSession{Host: "other.example", RepositoryID: 1, UserID: 7, Expires: base.Expires, BindingToken: binding.Generation}, false, 401},
		{"wrong repository", "/api/repos/first/manual", raw, &binding, RepositorySiteSession{Host: binding.Host, RepositoryID: 2, UserID: 7, Expires: base.Expires, BindingToken: binding.Generation}, false, 401},
		{"removed and rebound domain", "/api/repos/first/manual", raw, &binding, RepositorySiteSession{Host: binding.Host, RepositoryID: 1, UserID: 7, Expires: base.Expires, BindingToken: "old-binding"}, false, 401},
		{"expired binding", "/api/repos/first/manual", raw, &binding, RepositorySiteSession{Host: binding.Host, RepositoryID: 1, UserID: 7, Expires: time.Now().Add(-time.Minute), BindingToken: binding.Generation}, false, 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := query(tc.audience, tc.missing)
			var h http.Handler = AuthLoader(q, config.AuthConfig{})(RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, int64(7), UserFromContext(r.Context()).ID)
				w.WriteHeader(204)
			})))
			if tc.binding != nil {
				h = RepositorySiteAPI(*tc.binding, h)
			}
			r := httptest.NewRequest("GET", "https://manual.example"+tc.path, nil)
			r.AddCookie(&http.Cookie{Name: config.DefaultSessionCookieName, Value: tc.cookie})
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			require.Equal(t, tc.want, w.Code, w.Body.String())
		})
	}
}
