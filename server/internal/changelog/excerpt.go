package changelog

import (
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	east "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

// excerptMax is the longest excerpt in runes, before the ellipsis.
const excerptMax = 220

var markdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

// Excerpt is the plain text of a post's paragraphs and list items, in order, for the changelog
// list and link previews. Headings, code blocks, images and tables are left out; link and inline
// code text stay. It is cut at a word to at most 220 characters, with "…" when cut.
func Excerpt(md string) string {
	src := []byte(md)
	doc := markdown.Parser().Parse(text.NewReader(src))
	var b strings.Builder
	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			if n.Type() == ast.TypeBlock {
				b.WriteByte(' ')
			}
			return ast.WalkContinue, nil
		}
		switch n := n.(type) {
		case *ast.Heading, *ast.FencedCodeBlock, *ast.CodeBlock, *ast.HTMLBlock, *ast.Image, *ast.RawHTML:
			return ast.WalkSkipChildren, nil
		case *ast.Text:
			b.Write(n.Segment.Value(src))
			if n.SoftLineBreak() || n.HardLineBreak() {
				b.WriteByte(' ')
			}
		case *ast.String:
			b.Write(n.Value)
		case *ast.AutoLink:
			b.Write(n.URL(src))
		}
		if n.Kind() == east.KindTable {
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	return cut(strings.Join(strings.Fields(b.String()), " "), excerptMax)
}

// cut shortens s to at most max runes at a word boundary, adding "…" when it cuts.
func cut(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	r = r[:max+1]
	i := len(r) - 1
	for i > 0 && r[i] != ' ' {
		i--
	}
	if i == 0 {
		i = max
	}
	return strings.TrimRight(string(r[:i]), " ,;:") + "…"
}
