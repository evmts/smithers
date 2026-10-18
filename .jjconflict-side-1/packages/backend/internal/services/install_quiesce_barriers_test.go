package services

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Security opens quiesce only for the install's signed machine qualification:
// the same authority /api/install/metrics publishes, never a constant.
func TestSecurityQuiesceBarrierRequiresSignedQualification(t *testing.T) {
	require.EqualError(t, SecurityQuiesceBarrier{}.Check(t.Context()), "quiesce unavailable: T-SEC-01 required")

	public, private, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	id := QualificationIdentity{Commit: strings.Repeat("a", 40), InstallVersion: "1.0.0", BundleDigest: strings.Repeat("b", 64), Origin: "http://mini.lan:8080", HostID: "reference-mini"}
	qualified := MachineQualification{Version: 1, Status: "qualified", Commit: id.Commit, InstallVersion: id.InstallVersion, BundleDigest: id.BundleDigest, Origin: id.Origin, HostID: id.HostID, Runtime: "microvm", NonRoot: true, ReviewedBy: "smithers-3f", InventoryDigest: strings.Repeat("c", 64)}
	for name, paths := range qualificationPaths {
		qualified.Receipts = append(qualified.Receipts, QualificationReceipt{Name: name, Paths: paths, Status: "passed", Commit: id.Commit, BundleDigest: id.BundleDigest, InventoryDigest: qualified.InventoryDigest, Provenance: "authenticated-reference-host", ReceiptDigest: strings.Repeat("d", 64)})
	}
	file := filepath.Join(t.TempDir(), "machine-qualification.json")
	t.Setenv("SMITHERS_MACHINE_QUALIFICATION_FILE", file)
	sign := func(value MachineQualification) {
		payload, err := json.Marshal(value)
		require.NoError(t, err)
		document, err := json.Marshal(map[string]any{"key_id": "reviewed-mini", "payload": json.RawMessage(payload), "signature": base64.StdEncoding.EncodeToString(ed25519.Sign(private, payload))})
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(file, document, 0600))
	}
	qualification := NewInstalledQualification(id.Origin)
	qualification.Identity = func(context.Context) (QualificationIdentity, error) { return id, nil }
	barrier := SecurityQuiesceBarrier{Qualification: qualification}

	sign(qualified)
	require.EqualError(t, barrier.Check(t.Context()), "quiesce unavailable: T-SEC-01 required", "main approves no authority")
	qualification.Authorities = map[string]QualificationAuthority{"reviewed-mini": {HostID: id.HostID, PublicKey: public}}
	require.NoError(t, barrier.Check(t.Context()))
	require.NoError(t, barrier.Drain(t.Context()))
	require.NoError(t, barrier.Resume(t.Context()))

	unreviewed := qualified
	unreviewed.ReviewedBy = "owner"
	sign(unreviewed)
	require.EqualError(t, barrier.Check(t.Context()), "quiesce unavailable: T-SEC-01 required")
	require.EqualError(t, barrier.Resume(t.Context()), "quiesce unavailable: T-SEC-01 required")
}
