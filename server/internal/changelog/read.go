package changelog

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
)

func validLabel(l string) bool {
	return l == "new" || l == "improved" || l == "fixed"
}

// hasLabel matches posts carrying label (labels is stored as a JSON array).
func hasLabel(param, label string) dbx.Expression {
	return dbx.NewExp("EXISTS (SELECT 1 FROM json_each(labels) WHERE value = {:"+param+"})", dbx.Params{param: label})
}

// List is the public changelog: published posts, newest first, 20 a page. An unknown label
// means every post.
func (s *Service) List(label string, page int) (Page[PostSummary], error) {
	if page < 1 {
		page = 1
	}
	res := Page[PostSummary]{Items: []PostSummary{}, Page: page, PerPage: perPage}
	q := s.App.DB().Select().From(schema.Changelogs).Where(dbx.HashExp{"state": Published})
	if validLabel(label) {
		q.AndWhere(hasLabel("label", label))
	}
	if err := q.Select("count(*)").Row(&res.TotalItems); err != nil {
		return res, err
	}
	var ids []string
	err := q.Select("id").OrderBy("publishedAt DESC", "id DESC").
		Limit(perPage).Offset(int64((page - 1) * perPage)).Column(&ids)
	if err != nil {
		return res, err
	}
	recs, err := byIDs(s.App, ids)
	if err != nil {
		return res, err
	}
	for _, r := range recs {
		res.Items = append(res.Items, summary(r))
	}
	return res, nil
}

// byIDs loads posts keeping the order of ids.
func byIDs(app core.App, ids []string) ([]*core.Record, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	recs, err := app.FindRecordsByIds(schema.Changelogs, ids)
	if err != nil {
		return nil, err
	}
	m := make(map[string]*core.Record, len(recs))
	for _, r := range recs {
		m[r.Id] = r
	}
	out := make([]*core.Record, 0, len(ids))
	for _, id := range ids {
		if r := m[id]; r != nil {
			out = append(out, r)
		}
	}
	return out, nil
}

// BySlug is a published post's page. Drafts and scheduled posts are ErrNotFound for everyone:
// the editor has its own read. viewer (may be nil) decides which shipped requests show as voted.
func (s *Service) BySlug(slug string, viewer *core.Record) (Post, error) {
	if !ValidSlug(slug) {
		return Post{}, ErrNotFound
	}
	r, err := s.App.FindFirstRecordByFilter(schema.Changelogs, "slug = {:slug} && state = 'published'", dbx.Params{"slug": slug})
	if err != nil {
		return Post{}, ErrNotFound
	}
	shipped, err := requests.New(s.App).ItemsByID(r.GetStringSlice("requests"), viewer, false)
	if err != nil {
		return Post{}, err
	}
	return Post{PostSummary: summary(r), Body: r.GetString("body"), Cover: r.GetString("cover"), Shipped: shipped}, nil
}

// Failed lists the scheduled posts that didn't go out and are waiting in drafts with the reason.
func (s *Service) Failed() ([]FailedPost, error) {
	recs, err := s.App.FindRecordsByFilter(schema.Changelogs, "state = 'draft' && publishError != ''", "-publishAt", 0, 0)
	if err != nil {
		return nil, err
	}
	out := make([]FailedPost, 0, len(recs))
	for _, r := range recs {
		out = append(out, FailedPost{
			ID: r.Id, Title: r.GetString("title"), PublishAt: r.GetDateTime("publishAt").Time(), Error: r.GetString("publishError"),
		})
	}
	return out, nil
}
