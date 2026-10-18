package compose

import (
	"fmt"

	"github.com/smithersai/smithers/packages/backend/internal/services"
	"github.com/smithersai/smithers/packages/backend/internal/sse"
	"github.com/smithersai/smithers/packages/backend/operations"
)

// THE CORE POOL'S FLOOR, checked before the pool exists (plue#839).
//
// A process holds some core-pool connections for its whole life, and a
// workspace provisioning claim needs two more at once. Below their sum the
// claim gate measures too little headroom on every tick and refuses forever:
// at four connections, an api process with its two residents and a member's
// mutation transaction refused every start of a machine-owned branch, and a
// worker refused 21,600 retained-guest stops an hour. That is a configuration
// that cannot work, so the process refuses to start instead of running in it.

// corePoolResidents is how many core-pool connections this process holds for
// its whole life: the revocation bus's LISTEN, and the SSE broker's in a
// process that serves HTTP. A workers-only process has no SSE subscriber, so
// it starts no broker.
func corePoolResidents(t topology) int {
	residents := 1
	if t.servesHTTP() {
		residents++
	}
	return residents
}

// corePoolFloor is the smallest core pool this process can work in: its
// residents, one whole workspace claim, and one connection for any other work
// that runs beside that claim.
func corePoolFloor(t topology) int {
	return corePoolResidents(t) + services.WorkspaceProvisionConnectionsPerClaim + 1
}

func requireCorePoolFloor(maxConns int32, t topology) error {
	if floor := corePoolFloor(t); int(maxConns) < floor {
		return fmt.Errorf("database.max_conns=%d is below this process's floor of %d: %d resident listener connection(s), %d for one workspace claim and 1 for other work",
			maxConns, floor, corePoolResidents(t), services.WorkspaceProvisionConnectionsPerClaim)
	}
	return nil
}

// streamCounter hands the deployment the broker's live stream count, or nil
// in a process that started no broker.
func streamCounter(broker *sse.Broker) operations.StreamCounter {
	if broker == nil {
		return nil
	}
	return broker
}
