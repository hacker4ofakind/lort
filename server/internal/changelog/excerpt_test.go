package changelog_test

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
)

func TestExcerpt(t *testing.T) {
	cases := []struct{ name, md, want string }{
		{"skips a leading heading", "## What changed\n\nDark mode is here.", "Dark mode is here."},
		{"joins paragraphs and lists", "First line\nwraps.\n\n- One\n- Two", "First line wraps. One Two"},
		{"keeps link and code text", "See [the docs](https://x.test) and `npm i`.", "See the docs and npm i."},
		{"drops code blocks and images", "Hi.\n\n```\ncode here\n```\n\n![shot](/a.png)\n\nBye.", "Hi. Bye."},
		{"empty", "", ""},
	}
	for _, c := range cases {
		if got := changelog.Excerpt(c.md); got != c.want {
			t.Errorf("%s: Excerpt = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestExcerptCutsAtAWord(t *testing.T) {
	md := strings.Repeat("word ", 100)
	got := changelog.Excerpt(md)
	if !strings.HasSuffix(got, "word…") {
		t.Errorf("cut = %q", got)
	}
	if n := utf8.RuneCountInString(got); n > 221 {
		t.Errorf("len = %d runes", n)
	}
}

func TestExcerptCutsRunesNotBytes(t *testing.T) {
	got := changelog.Excerpt(strings.Repeat("ééé ", 80))
	if !utf8.ValidString(got) || strings.ContainsRune(got, utf8.RuneError) {
		t.Errorf("broken utf-8: %q", got)
	}
	if !strings.HasSuffix(got, "ééé…") {
		t.Errorf("cut = %q", got)
	}
}
