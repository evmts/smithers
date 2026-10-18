package config

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// HostedCodingUsers is who may run hosted coding turns on a multitenant
// deployment (agents.hosted_coding_user_ids, SMITHERS_HOSTED_CODING_USER_IDS).
// The zero value admits nobody, so an unset list fails closed.
type HostedCodingUsers struct {
	// Everyone is set only by the exact value "*". Setting the value back to
	// a list of IDs is the kill switch.
	Everyone bool
	// UserIDs are the admitted user IDs, sorted and without duplicates.
	UserIDs []int64
}

// Allows reports whether the user may run a hosted coding turn. No
// authenticated account has a non-positive ID, so none is ever admitted.
func (users HostedCodingUsers) Allows(userID int64) bool {
	if userID <= 0 {
		return false
	}
	if users.Everyone {
		return true
	}
	_, found := slices.BinarySearch(users.UserIDs, userID)
	return found
}

// ParseHostedCodingUserIDs reads the hosted coding allowlist. An empty value
// admits nobody. The exact value "*", with nothing around it, admits
// everyone. Anything else must be positive decimal user IDs separated by
// commas or spaces; "*" beside an ID, padded, or inside another entry is an
// error, never a wider grant.
func ParseHostedCodingUserIDs(value string) (HostedCodingUsers, error) {
	if value == "*" {
		return HostedCodingUsers{Everyone: true}, nil
	}
	var ids []int64
	for _, field := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || unicode.IsSpace(r) }) {
		id, err := strconv.ParseInt(field, 10, 64)
		if err != nil || id <= 0 {
			return HostedCodingUsers{}, fmt.Errorf(`want positive user IDs separated by commas, or exactly "*" for everyone, got %q in %q`, field, value)
		}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return HostedCodingUsers{UserIDs: slices.Compact(ids)}, nil
}

// hostedCodingUserIDsValue is the raw allowlist as one string. An
// environment value arrives verbatim; a config file may hold a scalar or a
// list. The value is never split on whitespace first, so a padded " * "
// reaches the parser as written and is refused.
func hostedCodingUserIDsValue(raw any, scalar string) string {
	items, ok := raw.([]any)
	if !ok {
		return scalar
	}
	fields := make([]string, len(items))
	for i, item := range items {
		fields[i] = fmt.Sprint(item)
	}
	return strings.Join(fields, ",")
}
