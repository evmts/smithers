package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/smithersai/smithers/packages/backend/internal/chat"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/middleware"
	"github.com/smithersai/smithers/packages/backend/ports"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture"
	"github.com/smithersai/smithers/packages/backend/testkit/postgresfixture/seed"
	"github.com/stretchr/testify/require"
)

type hostedInstructionHost struct{ grants chan ports.ChatTurnGrant }

func (h hostedInstructionHost) RunChatTurn(_ context.Context, grant ports.ChatTurnGrant) error {
	h.grants <- grant
	return ports.ErrModelCredentialMissing
}

// Admission and composition are real. The model boundary records its trusted
// instructions, rather than requiring a live model to reproduce policy prose.
func TestHostedChatRouteInstructsImmediateHonestChangeAnswer(t *testing.T) {
	pool, _ := postgresfixture.NewProductDatabase(t)
	owner, err := seed.CreateUser(t.Context(), pool, "hosted-instructions")
	require.NoError(t, err)
	host := hostedInstructionHost{grants: make(chan ports.ChatTurnGrant, 1)}
	composed, err := newChatComposition(runOptions{topology: hostedAPITopology, Options: Options{ChatHost: host, ChatProducerBaseURL: "https://callback.example.test"}}, pool, chat.RuntimeOptions{Concurrency: 1})
	require.NoError(t, err)
	defer composed.close()
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(middleware.ContextWithAuthInfo(r.Context(), &middleware.AuthInfo{User: &db.User{ID: owner, Username: "hosted-instructions"}, SessionHash: strings.Repeat("a", 64)})))
		})
	})
	composed.runtime.MountPublic(router)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/conversations/main/prompt", strings.NewReader(`{"prompt":"Create a branch, change the greeting and open a pull request","idempotencyKey":"hosted-change"}`)))
	require.Equal(t, http.StatusAccepted, response.Code, response.Body.String())
	ctx, cancel := context.WithCancel(t.Context())
	finished := make(chan error, 1)
	go func() { finished <- composed.runtime.Run(ctx) }()
	defer func() { cancel(); require.NoError(t, <-finished) }()
	select {
	case grant := <-host.grants:
		require.Nil(t, grant.API, "hosted instructions must not invent command grants")
		require.Contains(t, grant.AgentInstructions, "Changes run on your machine today; [install Smithers](/docs/installation/).")
		require.Contains(t, grant.AgentInstructions, "Do not start a coding run")
		require.Contains(t, grant.AgentInstructions, "Do not promise a branch, commit or pull request")
		require.Eventually(t, func() bool {
			_, terminal, err := composed.runtime.Handler.Store.GetState(t.Context(), chat.Scope{UserID: owner, Owner: "hosted-instructions"}, grant.TurnID)
			return err == nil && terminal
		}, 10*time.Second, 10*time.Millisecond, "wait for the real dispatcher receipt before shutting down the test composition")
	case <-time.After(10 * time.Second):
		t.Fatal("hosted chat route did not reach its model boundary")
	}
}
