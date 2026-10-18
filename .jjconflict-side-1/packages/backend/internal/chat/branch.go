package chat

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	pkgerrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
)

func (h *Handler) branch(w http.ResponseWriter, r *http.Request, scope Scope) (string, error) {
	branch, err := url.PathUnescape(chi.URLParam(r, "b"))
	if err != nil || !validIdentity(branch) {
		queueError(w, ErrInvalidRequest)
		return "", ErrInvalidRequest
	}
	if h.PrivateConversations && scope.RepositoryID == 0 {
		if branch != "main" {
			queueError(w, ErrForbidden)
			return "", ErrForbidden
		}
		// Never share a repository-free branch identity across accounts. The
		// browser supplies only main; authenticated identity supplies its owner.
		return accountConversationID(scope.UserID), nil
	}
	if h.ResolveBranch == nil {
		queueProblem(w, http.StatusServiceUnavailable, "conversation_unavailable")
		return "", ErrForbidden
	}
	resolved, err := h.ResolveBranch(r.Context(), scope, branch)
	if err != nil {
		var apiError *pkgerrors.APIError
		if errors.As(err, &apiError) {
			pkgerrors.WriteError(w, apiError)
		} else {
			queueError(w, err)
		}
		return "", err
	}
	return resolved, nil
}

func accountConversationID(userID int64) string { return fmt.Sprintf("account-%d-main", userID) }
