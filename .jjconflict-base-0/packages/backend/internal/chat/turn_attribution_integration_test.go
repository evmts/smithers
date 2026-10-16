package chat

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/smithersai/smithers/packages/backend/sandbox"
)

// linkedHost reads the resource link off the context it is dispatched with,
// which is where the sandbox provider reads it: the controller is stamped with
// whatever that link says, so a launch refused before anything exists is
// correlated by it or by nothing.
type linkedHost struct {
	seen  chan sandbox.ResourceLink
	after func() error
}

func (h linkedHost) RunTurn(ctx context.Context, _ ProducerGrant) error {
	select {
	case h.seen <- sandbox.RequestResourceLink(ctx):
	default:
	}
	return h.after()
}

// Generation 1 of production turn f413964a spent 300 s in sandbox_create with
// nothing committed, was interrupted for making no progress and was recorded
// as a host that stalled. Whether the fleet ever answered its create is not
// knowable after the fact, because the controller's refusals for chat carried
// no resource at all: of 589 "sandbox creation deferred: the fleet is full"
// lines between 12:28:00Z and 12:35:00Z that day, 141 name no box, no turn and
// no owner, while 441 name the workspace that is waiting. The link
// the provider stamps those mutations with is what closes that gap, and a
// refused launch is exactly the case that leaves no other trace.
func TestADispatchedTurnAttributesItsSandboxWorkToItself(t *testing.T) {
	store := needStore(t)
	scope, runID, journal := testScope(), "attribution-"+uuid.NewString(), testJournal()
	accepted := admit(t, store, scope, runID, journal)
	seen := make(chan sandbox.ResourceLink, 1)
	refuse := fullFleetHost{}
	host := linkedHost{seen: seen, after: func() error { return refuse.RunTurn(context.Background(), ProducerGrant{}) }}
	dispatcher, err := NewDispatcher(store, host, 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	fastRetries(dispatcher)
	if state := runDispatcherUntilTerminal(t, store, dispatcher, scope, accepted.TurnID); state != StateFailed {
		t.Fatalf("a turn out of attempts against a full fleet ended %s, want failed", state)
	}
	select {
	case link := <-seen:
		if link.Kind != chatTurnResourceKind {
			t.Fatalf("resource kind = %q, want %q", link.Kind, chatTurnResourceKind)
		}
		if link.ID != accepted.TurnID {
			t.Fatalf("resource id = %q, want the turn %q", link.ID, accepted.TurnID)
		}
	default:
		t.Fatal("the host was never dispatched")
	}
}

// The kind is a wire value, not a local name: the controller validates it on
// every mutation and refuses one that is not lower snake case with a leading
// letter, longer than 64 bytes, or sent without an id, and a refused create is
// the whole case this attribution exists for (Plue
// internal/microsandbox/control/controller.go, validateResourceOwner). That
// validator cannot be imported here, and the test above compares the
// dispatched link with this same constant, so renaming it would leave this
// package green while every chat sandbox create started coming back rejected.
// Pin the value and the shape the other side reads.
func TestTheChatTurnResourceKindIsOneTheControllerAccepts(t *testing.T) {
	if chatTurnResourceKind != "chat_turn" {
		t.Fatalf("resource kind = %q, want %q", chatTurnResourceKind, "chat_turn")
	}
	if len(chatTurnResourceKind) == 0 || len(chatTurnResourceKind) > 64 {
		t.Fatalf("resource kind %q is %d bytes, outside the controller's 1..64", chatTurnResourceKind, len(chatTurnResourceKind))
	}
	for index, character := range chatTurnResourceKind {
		letter := character >= 'a' && character <= 'z'
		tail := index > 0 && (character == '_' || (character >= '0' && character <= '9'))
		if !letter && !tail {
			t.Fatalf("resource kind %q is not lower snake case at index %d", chatTurnResourceKind, index)
		}
	}
}
