package requests_test

import (
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestSearchForgivesTypos(t *testing.T) {
	svc, app, board, mara := setup(t)
	dark := testutil.Request(t, app, board, mara, "Dark mode for the editor", "pending", 0)
	cal := testutil.Request(t, app, board, mara, "Calendar heatmap", "pending", 0)
	dictation := testutil.Request(t, app, board, mara, "Voice dictation in comments", "pending", 0)

	for _, c := range []struct {
		search string
		want   []string
	}{
		{"dark mode", []string{dark.Id}},
		{"da", []string{dark.Id}},        // a word being typed
		{"edit", []string{dark.Id}},      // prefix
		{"drak mdoe", []string{dark.Id}}, // swapped letters
		{"editr", []string{dark.Id}},     // a missing letter
		{"calender", []string{cal.Id}},   // a wrong letter
		{"heatmapp", []string{cal.Id}},   // an extra letter
		{"dictaton", []string{dictation.Id}},
		{"dark heatmap", nil}, // every word has to match
		{"zebra", nil},
		{"dog", nil}, // short words don't get typo matches
	} {
		page, err := svc.List(requests.Query{Search: c.search}, nil, false)
		if err != nil {
			t.Fatalf("%q: %v", c.search, err)
		}
		var got []string
		for _, it := range page.Items {
			got = append(got, it.ID)
		}
		if len(got) != len(c.want) || (len(got) == 1 && got[0] != c.want[0]) {
			t.Errorf("search %q = %v, want %v", c.search, got, c.want)
		}
	}
}
