package compose

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	apierrors "github.com/smithersai/smithers/packages/backend/internal/pkg/errors"
	"github.com/smithersai/smithers/packages/backend/jobs"
)

func accountOperationProcedure(procedure string) bool {
	switch procedure {
	case "Operation.Discover", "Operation.Dispatch", "Operation.History", "Operation.Read", "Operation.Cancel":
		return true
	default:
		return false
	}
}

// Account-only identity procedures use read:user. Every previous workflow
// method retains write:repository, including malformed or unknown procedures.
func workflowRPCScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, (1<<20)+1))
		if err != nil || len(body) > 1<<20 {
			browserFlowRefusal(w, 400, "Invalid workflow request.")
			return
		}
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		var request browserFlowRequest
		required := middleware.ScopeWriteRepository
		if json.Unmarshal(body, &request) == nil && accountOperationProcedure(request.Procedure) {
			required = middleware.ScopeReadUser
		}
		middleware.RequireScope(required)(next).ServeHTTP(w, r)
	})
}

func (api *browserFlowAPI) accountOperationRPC(w http.ResponseWriter, r *http.Request, request browserFlowRequest) {
	if api.accountOperations == nil {
		browserFlowRefusal(w, http.StatusServiceUnavailable, "Account operations unavailable.")
		return
	}
	var outcome any
	var err error
	switch request.Procedure {
	case "Operation.Discover":
		outcome, err = api.accountOperations.Discover(r.Context(), request.Payload)
	case "Operation.Dispatch":
		outcome, err = api.accountOperations.Dispatch(r.Context(), request.Payload)
	case "Operation.History":
		outcome, err = api.accountOperations.History(r.Context(), request.Payload)
	case "Operation.Read":
		outcome, err = api.accountOperations.Read(r.Context(), request.Payload)
	case "Operation.Cancel":
		outcome, err = api.accountOperations.Cancel(r.Context(), request.Payload)
	}
	if err != nil {
		switch {
		case errors.Is(err, jobs.ErrPayloadConflict):
			browserFlowTyped(w, http.StatusConflict, "request_conflict", "Request identity already belongs to another invocation.")
		case errors.Is(err, jobs.ErrNotFound):
			browserFlowTyped(w, http.StatusNotFound, "request_not_found", "Account request not found.")
		default:
			var refusal *apierrors.APIError
			if !errors.As(err, &refusal) {
				refusal = apierrors.Internal("Account operation failed.")
			}
			apierrors.WriteError(w, refusal)
		}
		return
	}
	browserFlowJSON(w, http.StatusOK, outcome)
}
