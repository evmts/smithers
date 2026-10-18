package services

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/internal/db"
)

// admittedEvents records the events AdmitGitHubEvent hands the store. Any
// other store call panics on the nil interface.
type admittedEvents struct {
	RepositoryJobStore
	events []string
}

func (a *admittedEvents) AdmitRepositoryJobEvent(_ context.Context, arg db.AdmitRepositoryJobEventParams) error {
	a.events = append(a.events, arg.EventType)
	return nil
}

// On a multitenant deployment a pull request, a review of one, or a check
// suite or run, which any GitHub user can raise on a public repository,
// starts no repository job; members' events still do. Without the setting
// (a single-owner install) every event is admitted as before.
func TestRepositoryJobsAdmitOnlyMemberEventsOnHosted(t *testing.T) {
	outside := []string{"pull_request", "pull_request_review", "pull_request_review_comment", "check_suite", "check_run", "workflow_run"}
	member := []string{"issues", "issue_comment", "push", "schedule"}
	job := db.GithubWebhookJob{DeliveryID: "d", Payload: json.RawMessage(`{"pull_request":{"number":7}}`)}
	for _, hosted := range []bool{true, false} {
		store := &admittedEvents{}
		service := NewRepositoryJobService(store, nil)
		if hosted {
			service.AdmitMemberEventsOnly()
		}
		for _, kind := range append(append([]string{}, outside...), member...) {
			require.NoError(t, service.AdmitGitHubEvent(context.Background(), 1, job, TriggerEvent{Type: kind, Action: "opened"}))
		}
		if hosted {
			assert.Equal(t, member, store.events)
			continue
		}
		assert.Equal(t, append(append([]string{}, outside...), member...), store.events)
	}
}
