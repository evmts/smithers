package sandbox

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestStatusErrorDoesNotInventProvider(t *testing.T) {
	err := (&StatusError{StatusCode: 503, Message: "unavailable"}).Error()
	if strings.Contains(err, "microsandbox") || !strings.Contains(err, "sandbox api returned status 503") {
		t.Fatalf("unspecified provider must remain neutral: %s", err)
	}
	named := (&StatusError{StatusCode: 503, Provider: "isolated-runtime"}).Error()
	if !strings.HasPrefix(named, "isolated-runtime api") {
		t.Fatalf("explicit provider identity was lost: %s", named)
	}
}

func TestIsNoCapacityReadsBothEnvelopeSpellings(t *testing.T) {
	bare := &StatusError{StatusCode: 503, ErrorCode: "no_capacity", Message: "no healthy worker has sufficient capacity"}
	structured := &StatusError{StatusCode: 503, Code: "No_Capacity "}
	if !IsNoCapacity(bare) || !IsNoCapacity(structured) {
		t.Fatal("a capacity refusal must be recognised however the provider spells its code")
	}
	if !IsNoCapacity(fmt.Errorf("create isolated chat sandbox: %w", bare)) {
		t.Fatal("a wrapped capacity refusal must still be recognised")
	}
	for _, other := range []error{
		nil,
		errors.New("no capacity"),
		&StatusError{StatusCode: 503, ErrorCode: "host_lease_lost"},
		&StatusError{StatusCode: 500},
	} {
		if IsNoCapacity(other) {
			t.Fatalf("%v must not read as a capacity refusal", other)
		}
	}
}
