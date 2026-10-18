package routes

import (
	"net/http"
	"regexp"

	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

var publicAgentSessionRead = regexp.MustCompile(`^/api/repos/[^/]+/[^/]+/agent/sessions(?:/[^/]+(?:/(?:messages|stream))?)?/?$`)

// AgentSessionReadPrivacy hides public conversation reads before repository or
// authentication middleware can disclose their existence. Ticket authentication
// runs first; the service checks the authenticated creator before any data read.
func AgentSessionReadPrivacy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor := middleware.UserFromContext(r.Context())
		if r.Method == http.MethodGet && publicAgentSessionRead.MatchString(r.URL.Path) && (actor == nil || actor.UserType == "guest") {
			pkgerrors.WriteError(w, pkgerrors.NotFound("agent session not found"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
