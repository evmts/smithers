package compose

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/smithersai/smithers/packages/backend/internal/config"
	"github.com/smithersai/smithers/packages/backend/internal/db"
	"github.com/smithersai/smithers/packages/backend/internal/routes"
	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/sse"
	"github.com/stretchr/testify/require"
)

func TestAgentSessionCreatorOnlyComposedPostgres(t *testing.T) {
	f := newLandingGateFixtureWithFactory(t, nil, "", true)
	_, err := f.pool.Exec(f.ctx, `UPDATE repositories SET is_public=true WHERE id=$1`, f.repoID)
	require.NoError(t, err)
	cfg := testConfigAllFlagsOn()
	cfg.Auth.Mode = config.AuthModeMultitenant
	cfg.Auth.SessionCookieName = "__Host-smithers_session"
	cfg.Server.PublicURL = "http://example.com"
	cfg.Server.AllowedOrigins = []string{cfg.Server.PublicURL}
	agents := services.NewAgentServiceWithPool(f.q, f.pool)
	handler := &routes.AgentSessionHandler{Service: agents}
	broker := sse.NewBroker(f.pool)
	require.NoError(t, broker.Start(f.ctx))
	t.Cleanup(broker.Stop)
	stream := &routes.AgentSessionStreamHandler{Service: agents, Broker: broker}
	router := buildRouterCompat(cfg, f.q, f.pool,
		&routes.RepoHandler{}, &routes.AuthHandler{}, &routes.UserHandler{}, &routes.SSHKeyHandler{}, &routes.LabelHandler{},
		&routes.OrgHandler{}, &routes.LandingHandler{}, &routes.SearchHandler{Service: &mockRouterSearchService{}}, &routes.IssueHandler{}, nil, &routes.GitSmartHandler{Service: &mockRouterGitService{}},
		nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, handler, stream, nil, nil, &routes.WorkspaceHandler{}, nil, nil, nil, nil, nil, nil)
	session, err := agents.CreateSession(f.ctx, services.CreateAgentSessionInput{RepositoryID: f.repoID, UserID: f.owner.ID, Title: "private conversation"})
	require.NoError(t, err)
	reader, err := f.q.CreateUser(f.ctx, db.CreateUserParams{Username: "transcript-reader", LowerUsername: "transcript-reader"})
	require.NoError(t, err)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	base := "/api/repos/gate-owner/app/agent/sessions"
	for _, actor := range []struct {
		name string
		user *db.User
	}{{"creator", &f.owner}, {"member", &f.other}, {"reader", &reader}, {"anonymous", nil}} {
		t.Run(actor.name, func(t *testing.T) {
			cookie := ""
			hash := ""
			if actor.user != nil {
				cookie = "privacy-" + actor.name
				sum := sha256.Sum256([]byte(cookie))
				hash = hex.EncodeToString(sum[:])
				_, err := f.q.CreateAuthSession(f.ctx, db.CreateAuthSessionParams{UserID: actor.user.ID, Username: actor.user.Username, SessionKey: hash, ExpiresAt: time.Now().Add(time.Hour)})
				require.NoError(t, err)
			}
			for _, suffix := range []string{"", "/" + session.ID, "/" + session.ID + "/messages", "/" + session.ID + "/stream"} {
				if actor.name == "creator" && strings.HasSuffix(suffix, "/stream") {
					continue
				}
				req := httptest.NewRequest("GET", cfg.Server.PublicURL+base+suffix, nil)
				if cookie != "" {
					req.AddCookie(&http.Cookie{Name: "__Host-smithers_session", Value: cookie})
				}
				out := httptest.NewRecorder()
				router.ServeHTTP(out, req)
				want := 404
				if actor.name == "creator" || suffix == "" && actor.user != nil {
					want = 200
				}
				require.Equal(t, want, out.Code, out.Body.String())
				if suffix == "" && actor.user != nil && actor.name != "creator" {
					require.JSONEq(t, `[]`, out.Body.String())
					require.Equal(t, "0", out.Header().Get("X-Total-Count"))
				}
			}
			if actor.user == nil {
				return
			}
			for _, ticketAuth := range []bool{false, true} {
				for _, replay := range []bool{false, true} {
					ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
					defer cancel()
					path := server.URL + base + "/" + session.ID + "/stream"
					if ticketAuth {
						ticket, err := services.NewSSETicketService(f.q).CreateTicket(f.ctx, actor.user.ID, false, "", hash)
						require.NoError(t, err)
						path += "?ticket=" + ticket.Ticket
					}
					req, err := http.NewRequestWithContext(ctx, "GET", path, nil)
					require.NoError(t, err)
					if !ticketAuth {
						req.AddCookie(&http.Cookie{Name: "__Host-smithers_session", Value: cookie})
					}
					replayMarker := ""
					if replay {
						cursor := int64(1)
						if actor.name == "creator" {
							before, err := agents.AppendMessage(f.ctx, session.ID, "user", nil)
							require.NoError(t, err)
							cursor = before.ID
							replayMarker = "replay-" + uuid.NewString()
							_, err = agents.AppendMessage(f.ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: []byte(fmt.Sprintf(`{"text":%q}`, replayMarker))}})
							require.NoError(t, err)
						}
						req.Header.Set("Last-Event-ID", fmt.Sprint(cursor))
					}
					response, err := http.DefaultClient.Do(req)
					require.NoError(t, err)
					if actor.name != "creator" {
						require.Equal(t, 404, response.StatusCode)
						response.Body.Close()
						continue
					}
					require.Equal(t, 200, response.StatusCode)
					scanner := bufio.NewScanner(response.Body)
					if replayMarker != "" {
						found := false
						for scanner.Scan() {
							if strings.Contains(scanner.Text(), replayMarker) {
								found = true
								break
							}
						}
						require.True(t, found, "creator receives persisted replay: %v", scanner.Err())
					}
					marker := "live-" + uuid.NewString()
					_, err = agents.AppendMessage(f.ctx, session.ID, "user", []db.CreateAgentPartParams{{PartType: "text", Content: []byte(fmt.Sprintf(`{"text":%q}`, marker))}})
					require.NoError(t, err)

					seen := false
					for scanner.Scan() {
						if strings.Contains(scanner.Text(), marker) {
							seen = true
							break
						}
					}
					response.Body.Close()
					require.True(t, seen, "creator receives persisted/live message: %v", scanner.Err())
				}
			}
		})
	}
}
