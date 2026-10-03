package compose

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/smithersai/smithers/packages/backend/internal/identity"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/webapp"
)

// SetupSessionScope never turns a setup credential into a person, even if a
// caller presents a member id or another credential (spec §5.1.0 / C-SEC-04).
func setupSessionScope(queries services.SetupSessionQuerier, clearCookie func(http.ResponseWriter, *http.Request), routers ...chi.Router) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Public browser pages/assets grant no API or Git authority. A
			// setup cookie must not prevent reload, including after a claim.
			path := r.URL.RawPath
			if path == "" {
				path = r.URL.Path
			}
			if len(routers) > 0 && !routers[0].Match(chi.NewRouteContext(), r.Method, path) && webapp.IsSetupPageRequest(r) {
				next.ServeHTTP(w, r)
				return
			}
			cookie, err := r.Cookie(services.SetupSessionCookieName)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			if err := services.ResolveSetupSession(r.Context(), queries, cookie.Value); err != nil {
				apiErr, ok := err.(*pkgerrors.APIError)
				if !ok {
					apiErr = pkgerrors.Internal("failed to resolve setup credential").WithCause(err)
				}
				if apiErr.Code == pkgerrors.CodeSetupClosed || apiErr.Code == pkgerrors.CodeUnauthenticated {
					clearCookie(w, r)
				}
				pkgerrors.WriteError(w, apiErr)
				return
			}
			if !identity.IsPreClaimSetupRequest(r.Method, r.URL.Path) {
				pkgerrors.WriteError(w, pkgerrors.New(pkgerrors.CodePermission, "finish setup before using this action"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
