package sandbox

import (
	"context"
	"reflect"
	"testing"
)

// The machine service user pays only for the organizations a deployment lists
// (plue#839, Security s-6tctk6). The product and the controller read the list
// with this one parser, and a malformed entry is an error, never skipped.
func TestParseServicePayerOrgIDs(t *testing.T) {
	for _, tc := range []struct {
		values []string
		want   []int64
	}{
		{nil, nil},
		{[]string{""}, nil},
		{[]string{" , "}, nil},
		{[]string{"2"}, []int64{2}},
		{[]string{" 7, 2 ,7"}, []int64{2, 7}},
		{[]string{"2 3"}, []int64{2, 3}},
		{[]string{"2", "3,2"}, []int64{2, 3}},
	} {
		got, err := ParseServicePayerOrgIDs(tc.values...)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("ParseServicePayerOrgIDs(%q) = %v, %v; want %v", tc.values, got, err, tc.want)
		}
	}
	for _, value := range []string{"0", "-2", "two", "2;3", "2.5", "0x2", "+2x", "9223372036854775808"} {
		if got, err := ParseServicePayerOrgIDs("2", value); err == nil {
			t.Errorf("ParseServicePayerOrgIDs(%q) = %v; want an error", value, got)
		}
	}
}

func TestServicePayerOrgsContext(t *testing.T) {
	ctx := context.Background()
	if got := ServicePayerOrgsFromContext(ctx); got == nil || len(got) != 0 {
		t.Fatalf("absent list = %#v; want an empty, non-nil list a query can bind", got)
	}
	orgs := []int64{2}
	ctx = WithServicePayerOrgs(ctx, orgs)
	orgs[0] = 9
	if got := ServicePayerOrgsFromContext(ctx); !reflect.DeepEqual(got, []int64{2}) {
		t.Fatalf("carried list = %v; want the caller's list as it was", got)
	}
	if got := ServicePayerOrgsFromContext(WithServicePayerOrgs(ctx, nil)); got == nil || len(got) != 0 {
		t.Fatalf("cleared list = %#v; want empty", got)
	}
}
