package compose

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/reposites"
)

// repositorySiteHTTP is outside bootstrap and assets too. Resolving a custom
// Host never grants that origin the person's account-wide API authority.
func repositorySiteHTTP(next http.Handler, cfg *config.Config, sites *reposites.Service) http.Handler {
	if !cfg.Sites.Enabled {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if cfg.Server.TrustedProxyHops > 0 && r.Header.Get("X-Forwarded-Host") != "" {
			host = r.Header.Get("X-Forwarded-Host")
		}
		site, err := sites.Resolve(r.Context(), host)
		if err == nil {
			middleware.RepositorySiteAPI(middleware.RepositorySiteBinding{Generation: site.ScopeGeneration, Host: host, RepositoryID: site.Repository.ID, Owner: site.Repository.Owner, Name: site.Repository.Name}, next).ServeHTTP(w, r)
			return
		}
		// An ordinary install's configured control origins retain their existing
		// behavior. Unclaimed site hosts never fall back to that control plane.
		for _, raw := range append(apiAllowedOrigins(cfg), cfg.Server.PublicURL, cfg.Auth.GitHubRedirectURL) {
			if u, e := url.Parse(raw); e == nil && strings.EqualFold(u.Host, host) {
				next.ServeHTTP(w, r)
				return
			}
		}
		switch r.URL.Path {
		case "/health", "/healthz", "/readyz":
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, "Unknown site host", http.StatusMisdirectedRequest)
	})
}
