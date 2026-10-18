package modelhost

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smithersai/smithers/packages/backend/ports"
)

// countingSlots is a GuestSlots that refuses with refusal, or grants and
// counts what is still held.
type countingSlots struct {
	mu       sync.Mutex
	refusal  error
	acquired int
	held     int
}

func (slots *countingSlots) Acquire(_ context.Context, ownerID int64) (func(context.Context), error) {
	slots.mu.Lock()
	defer slots.mu.Unlock()
	if ownerID <= 0 {
		return nil, errors.New("no owner")
	}
	if slots.refusal != nil {
		return nil, slots.refusal
	}
	slots.acquired++
	slots.held++
	return func(context.Context) {
		slots.mu.Lock()
		defer slots.mu.Unlock()
		slots.held--
	}, nil
}

func (slots *countingSlots) counts() (acquired, held int) {
	slots.mu.Lock()
	defer slots.mu.Unlock()
	return slots.acquired, slots.held
}

// launchPaths runs each of the four ways a Host starts a model host.
func launchPaths() map[string]func(*Host) error {
	return map[string]func(*Host) error{
		"chat turn": func(host *Host) error {
			return host.RunChatTurn(context.Background(), ports.ChatTurnGrant{OwnerID: 7, TurnID: "turn", RunID: "run", LegID: "run", Generation: 1, Token: "token"})
		},
		"model stream": func(host *Host) error {
			stream, err := host.RunModelStream(context.Background(), ports.ModelStreamGrant{OwnerID: 7, Request: json.RawMessage(`{"messages":[]}`)})
			if err != nil {
				return err
			}
			_, _ = io.Copy(io.Discard, stream)
			return stream.Close()
		},
		"wiki selection": func(host *Host) error {
			_, err := host.SelectContext(context.Background(), ports.ContextSelectionGrant{OwnerID: 7, RepositoryID: 11, Input: json.RawMessage(selectionInput)})
			return err
		},
		"model test": func(host *Host) error {
			_, err := host.RunModelTest(context.Background(), 7, json.RawMessage(`{"model":{"credential":"TEST_KEY"}}`))
			return err
		},
	}
}

func hostWithSlots(t *testing.T, launcher Launcher, slots GuestSlots) *Host {
	t.Helper()
	host, err := New(ResolverFunc(func(context.Context, int64, int64, json.RawMessage) (Binding, error) {
		return Binding{}, nil
	}), launcher)
	require.NoError(t, err)
	host.SetGuestSlots(slots)
	return host
}

// Every launch path takes a slot before any host exists (G3i), so a refused
// owner never reaches CreateSandbox, and the refusal keeps its type.
func TestEveryLaunchPathIsRefusedBeforeTheLauncher(t *testing.T) {
	for name, run := range launchPaths() {
		for _, refusal := range []error{&ports.ModelHostsBusy{Limit: 2}, modelHostsBusy(false, 2)} {
			t.Run(name, func(t *testing.T) {
				called := false
				host := hostWithSlots(t, testLauncher{called: &called}, &countingSlots{refusal: refusal})
				err := run(host)
				require.ErrorIs(t, err, refusal)
				require.False(t, called, "no host is launched over the cap")
			})
		}
	}
}

// A slot is freed on every way out of a launch path: the host answered, the
// host failed, or the launch itself failed.
func TestEveryLaunchPathFreesItsSlot(t *testing.T) {
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/context/select":
			_, _ = io.WriteString(w, selectionResult)
		case "/v1/model/test":
			_, _ = io.WriteString(w, `{"ok":true}`)
		default:
			_, _ = io.WriteString(w, "{\"type\":\"done\"}\n")
		}
	}))
	defer private.Close()
	failing := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("private host gone")
	})}
	for name, run := range launchPaths() {
		t.Run(name, func(t *testing.T) {
			for _, exit := range []struct {
				name     string
				launcher Launcher
			}{
				{"host answered", testLauncher{lease: &testLease{origin: private.URL}}},
				{"host failed", testLauncher{lease: &testLease{origin: private.URL, client: failing}}},
				{"launch failed", testLauncher{err: errors.New("create sandbox failed")}},
			} {
				slots := &countingSlots{}
				_ = run(hostWithSlots(t, exit.launcher, slots))
				acquired, held := slots.counts()
				require.Equal(t, 1, acquired, exit.name)
				require.Zero(t, held, "%s: the slot is freed", exit.name)
			}
		})
	}
}

// The release runs once even if a lease is closed twice.
func TestSlottedLeaseReleasesOnce(t *testing.T) {
	slots := &countingSlots{}
	host := hostWithSlots(t, testLauncher{lease: &testLease{}}, slots)
	lease, err := host.launch(context.Background(), ports.ChatTurnGrant{OwnerID: 7}, Binding{})
	require.NoError(t, err)
	require.NoError(t, lease.Close(context.Background()))
	require.NoError(t, lease.Close(context.Background()))
	acquired, held := slots.counts()
	require.Equal(t, 1, acquired)
	require.Zero(t, held)
}
