package config

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// HostedWorkspaceUsers is the hosted staff list: who may create or wake a
// box on a multitenant deployment outside an agent turn
// (sandbox.hosted_workspace_user_ids, SMITHERS_HOSTED_WORKSPACE_USER_IDS).
// The zero value admits nobody, so an unset list fails closed. There is no
// wildcard: opening boxes to everyone needs per-payer admission first, not a
// config value.
type HostedWorkspaceUsers struct {
	// UserIDs are the admitted user IDs, sorted and without duplicates.
	UserIDs []int64
}

// Allows reports whether the user is on the staff list. No authenticated
// account has a non-positive ID, so none is ever admitted.
func (users HostedWorkspaceUsers) Allows(userID int64) bool {
	if userID <= 0 {
		return false
	}
	_, found := slices.BinarySearch(users.UserIDs, userID)
	return found
}

// ParseHostedWorkspaceUserIDs reads the hosted staff list. An empty value
// admits nobody. Anything else must be positive decimal user IDs separated
// by commas or spaces; "*" anywhere, or any other entry, is an error, never a
// wider grant.
func ParseHostedWorkspaceUserIDs(value string) (HostedWorkspaceUsers, error) {
	var ids []int64
	for _, field := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || unicode.IsSpace(r) }) {
		if strings.Contains(field, "*") {
			return HostedWorkspaceUsers{}, fmt.Errorf(`"*" is not allowed: list positive user IDs separated by commas, got %q`, value)
		}
		id, err := strconv.ParseInt(field, 10, 64)
		if err != nil || id <= 0 {
			return HostedWorkspaceUsers{}, fmt.Errorf("want positive user IDs separated by commas, got %q in %q", field, value)
		}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return HostedWorkspaceUsers{UserIDs: slices.Compact(ids)}, nil
}
