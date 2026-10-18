package flowdispatch

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/smithersai/smithers/packages/backend/jobs"
	"github.com/stretchr/testify/require"
)

// A terminal projector may quiesce the host before its transaction commits.
// Retry must use the drained checkpoint, including after a worker restart.
func TestTerminalCheckpointRetriesProjectionWithoutHost(t *testing.T) {
	for _, status := range []string{"completed", "cancelled", "failed"} {
		t.Run(status, func(t *testing.T) {
			store, _ := newFlowDispatchStore(t)
			runtime := newRecordingRuntime()
			runtime.status = status
			var stopped atomic.Bool
			var resolutions, projections atomic.Int32
			workerCtx, stopWorker := context.WithCancel(t.Context())
			defer stopWorker()
			config := Config{Store: store,
				Resolver: flowruntime.ResolverFunc(func(context.Context, flowruntime.Target) (flowruntime.Runtime, error) {
					resolutions.Add(1)
					if stopped.Load() {
						return nil, errors.New("host has been quiesced")
					}
					return runtime, nil
				}),
				Projector: ProjectorFunc(func(_ context.Context, update ProjectionUpdate) error {
					if update.State.Terminal() {
						stopped.Store(true)
						if projections.Add(1) == 1 {
							stopWorker()
							return errors.New("transient product transaction failure")
						}
					}
					return nil
				}),
			}
			service, err := New(config)
			require.NoError(t, err)
			request := testLaunchRequest("terminal-checkpoint-retry", ApprovalAuto)
			receipt, err := service.Admit(t.Context(), request)
			require.NoError(t, err)
			done := make(chan error, 1)
			go func() {
				done <- service.RunWorker(workerCtx, jobs.WorkerConfig{WorkerID: "before-quiesce", Capacity: 1, Lease: time.Second, PollInterval: time.Millisecond, RetryDelay: time.Millisecond})
			}()
			select {
			case err := <-done:
				require.NoError(t, err)
			case <-time.After(5 * time.Second):
				t.Fatal("first worker never stopped after projection failure")
			}
			replacement, err := New(config)
			require.NoError(t, err)
			startTestWorker(t, replacement, "terminal-retry")
			op := waitOperation(t, store, request.Scope, receipt.OperationID, func(op jobs.Operation) bool { return op.State.Terminal() })
			require.Equal(t, map[string]jobs.State{"completed": jobs.StateCompleted, "cancelled": jobs.StateCancelled, "failed": jobs.StateFailed}[status], op.State)
			require.EqualValues(t, 2, projections.Load())
			require.EqualValues(t, 1, resolutions.Load(), "retry must not wake or resolve a quiesced host")
			runtime.mu.Lock()
			defer runtime.mu.Unlock()
			require.Equal(t, 1, runtime.observeCount)
			require.Len(t, runtime.launches, 1)
		})
	}
}
