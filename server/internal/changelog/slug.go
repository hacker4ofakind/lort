// Package changelog holds the rules for changelog posts: their addresses, excerpts and the
// publish lifecycle, and the public and team reads.
package changelog

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// slugMax is the longest address a post may have.
const slugMax = 80

// slugWords is how many words of the title make the automatic address.
const slugWords = 6

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidSlug reports whether s may be a post's address: lowercase letters, digits and single
// hyphens between them, at most 80 characters.
func ValidSlug(s string) bool {
	return len(s) <= slugMax && slugPattern.MatchString(s)
}

// Slugify makes the automatic address from a title: accents dropped, lowercase, the first six
// words joined by hyphens, at most 80 characters. Letters NFKD can't turn into a-z (ß, Ł,
// Cyrillic) are dropped, so a title with none left gives "" and the team sets the address.
func Slugify(title string) string {
	var words []string
	var word strings.Builder
	end := func() {
		if word.Len() > 0 {
			words = append(words, word.String())
			word.Reset()
		}
	}
	for _, r := range norm.NFKD.String(title) {
		r = unicode.ToLower(r)
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			word.WriteRune(r)
		case unicode.IsLetter(r), unicode.IsMark(r), unicode.IsNumber(r):
			// part of a word, but not something an address can hold
		default:
			end()
		}
	}
	end()
	if len(words) > slugWords {
		words = words[:slugWords]
	}
	s := strings.Join(words, "-")
	if len(s) > slugMax {
		s = s[:slugMax]
		if i := strings.LastIndexByte(s, '-'); i > 0 {
			s = s[:i]
		}
	}
	return s
}
