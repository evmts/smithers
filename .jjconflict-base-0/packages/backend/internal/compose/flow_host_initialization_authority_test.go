package compose

import (
	"testing"

	"github.com/smithersai/smithers/packages/backend/flowhost"
	"github.com/smithersai/smithers/packages/backend/flowruntime"
	"github.com/stretchr/testify/require"
)

// Background initialization re-resolves the target and refuses a host whose
// authority moved. flowhost.Authority documents that SourceRevision "may be
// empty when reconnecting to an existing, pinned binding", and a resolver
// that pins no revision of its own restates none: services.resolveWikiTarget
// returns an authority with no revision at all. Comparing that absence as a
// change refused every wiki-bound coding host for good — measured on a real
// composed Linux install as expected_source set, actual_source empty, three
// consecutive times, which is what stopped every rehearsal's coding turn.
//
// An unrestated revision is therefore not a changed revision. Every other
// identity, and a restated revision that really differs, still refuses.
func TestInitializationAuthorityChange(t *testing.T) {
	admitted := flowhost.Authority{
		Target:       flowruntime.Target{BindingKind: "mythical-wiki"},
		RepositoryID: 7, UserID: 11, WorkspaceID: "lane-1",
		SourceRevision: "5f5926b2df8eb1ff4a246f36b00a801f45934197",
	}
	moved := func(change func(*flowhost.Authority)) flowhost.Authority {
		current := admitted
		change(&current)
		return current
	}
	for _, test := range []struct {
		name    string
		current flowhost.Authority
		changed bool
	}{
		{"unchanged", admitted, false},
		{"a resolver that restates no revision", moved(func(a *flowhost.Authority) { a.SourceRevision = "" }), false},
		{"a restated revision that differs", moved(func(a *flowhost.Authority) { a.SourceRevision = "0000000000000000000000000000000000000000" }), true},
		{"another workspace", moved(func(a *flowhost.Authority) { a.WorkspaceID = "lane-2" }), true},
		{"another repository", moved(func(a *flowhost.Authority) { a.RepositoryID = 8 }), true},
		{"another sponsor", moved(func(a *flowhost.Authority) { a.UserID = 12 }), true},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.changed, initializationAuthorityChanged(t.Context(), test.current, admitted))
		})
	}
}
