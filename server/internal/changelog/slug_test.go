package changelog_test

import (
	"strings"
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Dark mode is here, plus faster search": "dark-mode-is-here-plus-faster",
		"Café & crème brûlée!":                  "cafe-creme-brulee",
		"Straße":                                "strae",
		"Łódź":                                  "odz",
		"🎉":                                     "",
		"Тёмная тема":                           "",
		"":                                      "",
		"  One two three four five six seven  ": "one-two-three-four-five-six",
		"Fixed: the CSV export (again)":         "fixed-the-csv-export-again",
	}
	for in, want := range cases {
		if got := changelog.Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSlugifyCapsLength(t *testing.T) {
	long := strings.Repeat("a", 200)
	if got := changelog.Slugify(long); len(got) != 80 {
		t.Errorf("one long word: len = %d", len(got))
	}
	words := strings.Repeat("abcdefghijklmnopq ", 6) // 6 × 17 letters + hyphens = 107
	got := changelog.Slugify(words)
	if len(got) > 80 || strings.HasSuffix(got, "-") || strings.Count(got, "-") != 3 {
		t.Errorf("long words: %q (len %d)", got, len(got))
	}
	if !changelog.ValidSlug(got) {
		t.Errorf("%q is not valid", got)
	}
}

func TestValidSlug(t *testing.T) {
	for _, s := range []string{"dark-mode", "a", "v2-launch", strings.Repeat("a", 80)} {
		if !changelog.ValidSlug(s) {
			t.Errorf("ValidSlug(%q) = false", s)
		}
	}
	for _, s := range []string{"", "Dark", "-a", "a-", "a--b", "a b", "café", strings.Repeat("a", 81)} {
		if changelog.ValidSlug(s) {
			t.Errorf("ValidSlug(%q) = true", s)
		}
	}
}
