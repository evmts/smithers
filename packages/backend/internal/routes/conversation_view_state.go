package routes

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// ConversationViewHandler serves the browser member's private main view.
// Reuse the install authorizer and roster; no caller chooses a member or repo.
type ConversationViewHandler struct{ Queries *db.Queries }

type mainViewPatch struct {
	LastSeenSeq *int64  `json:"last_seen_seq,omitempty"`
	Filter      *string `json:"filter,omitempty"`
	Maximized   *bool   `json:"maximized,omitempty"`
}

func decodeMainViewPatch(r *http.Request, w http.ResponseWriter) (json.RawMessage, error) {
	var patch mainViewPatch
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	var raw json.RawMessage
	if err := decodeSingleJSONDocument(decoder, &raw); err != nil {
		return nil, err
	}
	if len(raw) == 0 || raw[0] != '{' {
		return nil, errInvalidMainView
	}
	strict := json.NewDecoder(strings.NewReader(string(raw)))
	strict.DisallowUnknownFields()
	if err := strict.Decode(&patch); err != nil {
		return nil, err
	}
	if patch.LastSeenSeq != nil && (*patch.LastSeenSeq < 0 || *patch.LastSeenSeq > 9007199254740991) {
		return nil, errInvalidMainView
	}
	if patch.Filter != nil {
		switch *patch.Filter {
		case "", "queued", "starting", "working", "needs_you", "paused", "failed", "in_review", "merged", "dropped":
		default:
			return nil, errInvalidMainView
		}
	}
	return json.Marshal(patch)
}

var errInvalidMainView = &viewStateError{}

type viewStateError struct{}

func (*viewStateError) Error() string { return "Invalid view state" }

func (h *ConversationViewHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	repo, user, ok := authorizeInstallRepository(w, r, h.Queries, "view.read")
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	var state json.RawMessage
	var err error
	if r.Method == http.MethodPut {
		var patch json.RawMessage
		patch, err = decodeMainViewPatch(r, w)
		if err != nil {
			http.Error(w, "Invalid view state", http.StatusBadRequest)
			return
		}
		state, err = h.Queries.SaveMainViewState(r.Context(), repo, user, patch)
	} else {
		state, err = h.Queries.MainViewState(r.Context(), repo, user)
	}
	if err != nil {
		todoRouteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(state)
}
