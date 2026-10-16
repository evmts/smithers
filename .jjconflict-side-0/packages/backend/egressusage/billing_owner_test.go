package egressusage

import (
	"encoding/json"
	"testing"
)

func TestRepositoryUserAndOrganizationEgressDoNotShareQuota(t *testing.T) {
	pool := testSuite.Pool(t)
	user := chargeRequest("payer-user", 3756, 10, 10)
	org := chargeRequest("payer-org", 3756, 10, 10)
	// Decode the controller's persisted attribution, including a policy written
	// before the ledger process was restarted.
	if err := json.Unmarshal([]byte(`{"BillingOwnerType":"org"}`), &org); err != nil {
		t.Fatal(err)
	}
	for _, request := range []ChargeRequest{user, org} {
		allowed, err := commitCharge(t.Context(), pool, request)
		if err != nil {
			t.Fatal(err)
		}
		if allowed != 10 {
			t.Fatalf("independent payer allowance = %d; want 10", allowed)
		}
	}
	if dailyUsed(t, pool, "user:3756", testDay) != 10 || dailyUsed(t, pool, "org:3756", testDay) != 10 {
		t.Fatal("payer scopes were conflated")
	}
	// A receipt cannot be replayed against a different type of account.
	if err := json.Unmarshal([]byte(`{"BillingOwnerType":"org"}`), &user); err != nil {
		t.Fatal(err)
	}
	if _, err := commitCharge(t.Context(), pool, user); err != ErrConflict {
		t.Fatalf("cross-payer replay: %v", err)
	}
}
