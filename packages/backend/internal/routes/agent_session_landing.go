package routes

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/internal/services"
)

// AgentSessionLandingRouteService opens the person's pull request from a turn receipt.
type AgentSessionLandingRouteService interface {
	Open(context.Context, *db.User, string, string, string, *int64) (services.SessionLanding, error)
}

// OpenLanding handles POST /agent/sessions/{session_id}/landing; it never merges.
func (h *AgentSessionHandler) OpenLanding(w http.ResponseWriter, r *http.Request) {
	if h.Landing == nil {
		pkgerrors.WriteError(w, pkgerrors.Internal("session landing unavailable"))
		return
	}
	sessionID, err := routeParam(r, "session_id", "session id is required")
	if err != nil {
		pkgerrors.WriteError(w, err.(*pkgerrors.APIError))
		return
	}
	repo := middleware.RepoContextFromContext(r.Context())
	if repo == nil || repo.Repository == nil {
		pkgerrors.WriteError(w, pkgerrors.BadRequest("repository context required"))
		return
	}
	var input struct {
		ReplyID *int64 `json:"reply_id"`
	}
	if !decodeJSONBody(w, r, &input) {
		return
	}
	result, err := h.Landing.Open(r.Context(), middleware.UserFromContext(r.Context()), repo.Owner, repo.Repository.Name, sessionID, input.ReplyID)
	if err != nil {
		writeRouteError(w, r, err)
		return
	}
	pkgerrors.WriteJSON(w, http.StatusCreated, result)
}

var sessionLandingPath = regexp.MustCompile(`^/api/repos/[^/]+/[^/]+/agent/sessions/[^/]+/landing$`)

func isSessionLandingPost(r *http.Request) bool {
	return r.Method == http.MethodPost && sessionLandingPath.MatchString(r.URL.Path)
}

// SessionLandingAgentCredentialFirst rejects the workflow agent credential
// namespace before AuthLoader (which only loads person/API credentials). This
// is a refusal only: it neither authenticates a token nor reads a repository.
func SessionLandingAgentCredentialFirst(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fields := strings.Fields(r.Header.Get("Authorization"))
		if isSessionLandingPost(r) && len(fields) == 2 &&
			(strings.EqualFold(fields[0], "Bearer") || strings.EqualFold(fields[0], "token")) &&
			strings.HasPrefix(fields[1], "smithers_agent_") {
			pkgerrors.WriteError(w, pkgerrors.New(pkgerrors.CodeAgentCredentialRefused, "Only a person can open this pull request"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// SessionLandingCredentialFirst preserves the contract's credential refusals
// before repository resolution or generic read middleware can replace them.
func SessionLandingCredentialFirst(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isSessionLandingPost(r) {
			next.ServeHTTP(w, r)
			return
		}
		user := middleware.UserFromContext(r.Context())
		info := middleware.AuthInfoFromContext(r.Context())
		var refusal *pkgerrors.APIError
		switch {
		case middleware.AgentTokenFromContext(r.Context()) != "" || info.IsAgent() || user != nil && middleware.IsAgentAccount(user.UserType):
			refusal = pkgerrors.New(pkgerrors.CodeAgentCredentialRefused, "Only a person can open this pull request")
		case user == nil:
			refusal = pkgerrors.New(pkgerrors.CodeSignInRequired, "Sign in to open a pull request")
		case user.UserType == "guest":
			refusal = pkgerrors.New(pkgerrors.CodeGuestRefused, "Sign in to open a pull request")
		case info != nil && info.IsTokenAuth && !info.Scopes.Has(middleware.ScopeWriteRepository):
			refusal = pkgerrors.New(pkgerrors.CodePushPermissionRequired, "Repository write scope is required")
		}
		if refusal != nil {
			pkgerrors.WriteError(w, refusal)
			return
		}
		next.ServeHTTP(w, r)
	})
}
