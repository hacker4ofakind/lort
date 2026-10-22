package changelog

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/pocketbase/dbx"

	"github.com/hacker4ofakind/lort/server/internal/schema"
)

// pageMeta is what a post's page and share card need for link previews.
type pageMeta struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Image       string `json:"image"`
	AppName     string `json:"appName"`
}

// PageMeta is the X-Lort-Page header for a page path: unpadded base64url JSON describing the
// published post at /changelog/<slug> or /changelog-card/<slug>, or "" for any other path.
// It costs one indexed query, and only on those paths.
func (s *Service) PageMeta(path string) string {
	slug, ok := strings.CutPrefix(path, "/changelog/")
	if !ok {
		slug, ok = strings.CutPrefix(path, "/changelog-card/")
	}
	if !ok || !ValidSlug(slug) {
		return ""
	}
	r, err := s.App.FindFirstRecordByFilter(schema.Changelogs, "slug = {:slug} && state = 'published'", dbx.Params{"slug": slug})
	if err != nil {
		return ""
	}
	base := strings.TrimRight(s.BaseURL, "/")
	m := pageMeta{
		Title: r.GetString("title"), Description: r.GetString("excerpt"),
		URL: base + "/changelog/" + slug, Image: base + "/changelog-card/" + slug, AppName: s.AppName(),
	}
	if cover := r.GetString("cover"); cover != "" {
		m.Image = base + "/api/files/changelogs/" + r.Id + "/" + cover + "?thumb=1200x630"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
