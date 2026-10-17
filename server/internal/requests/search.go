package requests

import (
	"sort"
	"strings"
	"unicode"
)

// maxAlternatives caps how many indexed words one typed word may stand for.
const maxAlternatives = 16

// searchWords splits free text into lowercase words of letters and digits (2+ characters, at
// most 8 words).
func searchWords(text string) []string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := make([]string, 0, len(words))
	for _, w := range words {
		if len([]rune(w)) < 2 {
			continue
		}
		out = append(out, w)
		if len(out) == 8 {
			break
		}
	}
	return out
}

// maxEdits is how many typos a typed word may contain: none under 4 characters (too many short
// words are one edit apart), one up to 7, two from 8.
func maxEdits(word string) int {
	switch n := len([]rune(word)); {
	case n < 4:
		return 0
	case n < 8:
		return 1
	}
	return 2
}

// searchQuery turns free text into an FTS5 query that forgives typos. Every word has to match,
// either as a prefix (the word being typed) or as any indexed word (vocab, the index's
// stemmed terms) within maxEdits of it, whole or as a prefix. Only letters and digits reach the
// query, and every term is quoted, so the text can't inject FTS syntax.
func searchQuery(text string, vocab []string) string {
	words := searchWords(text)
	parts := make([]string, 0, len(words))
	for _, w := range words {
		alts := []string{quote(w) + "*"}
		if max := maxEdits(w); max > 0 {
			type near struct {
				term string
				dist int
			}
			var nears []near
			for _, t := range vocab {
				if strings.HasPrefix(t, w) {
					continue // the prefix match already covers it
				}
				if d := closeness(w, t, max); d >= 0 {
					nears = append(nears, near{t, d})
				}
			}
			sort.SliceStable(nears, func(i, j int) bool { return nears[i].dist < nears[j].dist })
			for i := 0; i < len(nears) && i < maxAlternatives; i++ {
				alts = append(alts, quote(nears[i].term))
			}
		}
		if len(alts) == 1 {
			parts = append(parts, alts[0])
		} else {
			parts = append(parts, "("+strings.Join(alts, " OR ")+")")
		}
	}
	return strings.Join(parts, " AND ")
}

func quote(term string) string {
	return `"` + strings.ReplaceAll(term, `"`, `""`) + `"`
}

// closeness is the fewest edits between word and term, or between word and the start of term
// (a half-typed word), or -1 when both are over max.
func closeness(word, term string, max int) int {
	w, t := []rune(word), []rune(term)
	best := -1
	consider := func(d int) {
		if d <= max && (best < 0 || d < best) {
			best = d
		}
	}
	consider(editDistance(w, t))
	if len(t) > len(w) {
		consider(editDistance(w, t[:len(w)]))
	}
	return best
}

// editDistance counts insertions, deletions, substitutions and swaps of neighbouring letters
// (optimal string alignment), so "drak" is one edit from "dark".
func editDistance(a, b []rune) int {
	if d := len(a) - len(b); d > 2 || d < -2 {
		return 3 // further than any word may be
	}
	prev2 := make([]int, len(b)+1)
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		cur[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				cur[j] = min(cur[j], prev2[j-2]+1)
			}
		}
		prev2, prev, cur = prev, cur, prev2
	}
	return prev[len(b)]
}
