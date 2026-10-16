package microsandbox

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// A stop deadline that lands while a status observation is still running is
// an unconfirmed stop, not an observation failure.
func TestStopDeadlineDuringObservationIsUnconfirmedStop(t *testing.T) {
	r, _ := admissionFixture()
	root := t.TempDir()
	binary := filepath.Join(root, "msb")
	script := "#!/bin/sh\ncase \"$1\" in\nlist) exec sleep 5;;\nesac\n"
	require.NoError(t, os.WriteFile(binary, []byte(script), 0700))
	r.cli = &cli{binary: binary, home: root}
	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()
	err := r.stopMachine(ctx, "vm-a")
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.ErrorContains(t, err, "microVM vm-a stop is not confirmed: unobserved")
}

// The last observed status is named when the deadline lands mid-observation.
func TestStopDeadlineNamesLastObservedStatus(t *testing.T) {
	r, _ := admissionFixture()
	root := t.TempDir()
	binary := filepath.Join(root, "msb")
	seen := filepath.Join(root, "seen")
	script := fmt.Sprintf("#!/bin/sh\ncase \"$1\" in\nlist) if [ -f '%[1]s' ]; then exec sleep 5; fi; touch '%[1]s'; echo '[{\"name\":\"vm-a\",\"status\":\"stopping\"}]';;\nesac\n", seen)
	require.NoError(t, os.WriteFile(binary, []byte(script), 0700))
	r.cli = &cli{binary: binary, home: root}
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	err := r.stopMachine(ctx, "vm-a")
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.ErrorContains(t, err, "microVM vm-a stop is not confirmed: stopping")
}
