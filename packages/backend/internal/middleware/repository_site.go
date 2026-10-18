package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	apierrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

// RepositorySiteBinding is supplied only by the backend's verified Host
// directory. A custom site's scripts must never inherit account-wide API
// authority merely because the person signed in on that site.
type RepositorySiteBinding struct {
	Generation   string
	Host         string
	RepositoryID int64
	Owner        string
	Name         string
}
type repositorySiteKey struct{}

func ContextWithRepositorySite(ctx context.Context, binding RepositorySiteBinding) context.Context {
	return context.WithValue(ctx, repositorySiteKey{}, binding)
}
func RepositorySiteFromContext(ctx context.Context) (RepositorySiteBinding, bool) {
	v, ok := ctx.Value(repositorySiteKey{}).(RepositorySiteBinding)
	return v, ok
}

const RepositorySiteSessionPrefix = "smithers_site_"

type RepositorySiteSession struct {
	BindingToken string    `json:"bindingToken"`
	Host         string    `json:"host"`
	RepositoryID int64     `json:"repositoryId"`
	UserID       int64     `json:"userId"`
	Expires      time.Time `json:"expires"`
}

func RepositorySiteSessionKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return "sites/session/" + hex.EncodeToString(h[:])
}
func validRepositorySiteSession(ctx context.Context, queries AuthLoaderQuerier, raw string, userID int64) bool {
	site, bound := RepositorySiteFromContext(ctx)
	if !strings.HasPrefix(raw, RepositorySiteSessionPrefix) {
		return !bound
	}
	if !bound {
		return false
	}
	reader, ok := queries.(interface {
		GetInstallSetting(context.Context, string) (db.InstallSetting, error)
	})
	if !ok {
		return false
	}
	row, err := reader.GetInstallSetting(ctx, RepositorySiteSessionKey(raw))
	if err != nil {
		return false
	}
	var audience RepositorySiteSession
	if json.Unmarshal(row.Value, &audience) != nil {
		return false
	}
	return audience.BindingToken == site.Generation && audience.Host == site.Host && audience.RepositoryID == site.RepositoryID && audience.UserID == userID && time.Now().Before(audience.Expires)
}

// RepositorySiteAPI restricts an alias to its repository and explicit identity
// exchange. It does not rewrite routes, credentials or the user's role. In
// particular token minting, account settings and other repositories stay out.
func RepositorySiteAPI(binding RepositorySiteBinding, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if path.Clean(p) != strings.TrimSuffix(p, "/") && p != "/" || strings.Contains(p, "\\") {
			apierrors.WriteError(w, apierrors.Forbidden("Repository site scope"))
			return
		}
		if strings.HasPrefix(p, "/api/") || p == "/api" {
			allowed := false
			root := "/api/repos/" + binding.Owner + "/" + binding.Name
			if strings.EqualFold(p, root) || strings.HasPrefix(strings.ToLower(p), strings.ToLower(root)+"/") {
				allowed = true
			}
			if r.Method == "GET" || r.Method == "HEAD" {
				switch p {
				case "/api/bootstrap", "/api/user", "/api/public/repos", "/api/sites/resolve", "/api/sites/content", "/api/auth/site/start", "/api/auth/site/complete":
					allowed = true
				}
			}
			if r.Method == "POST" && p == "/api/auth/logout" {
				allowed = true
			}
			if !allowed {
				apierrors.WriteError(w, apierrors.Forbidden("Repository site scope"))
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" && !SameOrigin(origin, "https://"+binding.Host) {
				apierrors.WriteError(w, apierrors.Forbidden("Repository site origin"))
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(ContextWithRepositorySite(r.Context(), binding)))
	})
}
