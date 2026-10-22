package changelog

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
)

// TeamQuery is what the dashboard list asks for.
type TeamQuery struct {
	States []string
	Labels []string // a post matches if it has any of them
	Q      string   // part of the title
	Page   int
}

// TeamList is the dashboard list: drafts, then scheduled, then published, each newest first.
func (s *Service) TeamList(tq TeamQuery) (Page[TeamPost], error) {
	if tq.Page < 1 {
		tq.Page = 1
	}
	res := Page[TeamPost]{Items: []TeamPost{}, Page: tq.Page, PerPage: perPage}
	q := s.App.DB().Select().From(schema.Changelogs)
	var states []any
	for _, st := range tq.States {
		if st == Draft || st == Scheduled || st == Published {
			states = append(states, st)
		}
	}
	if len(states) > 0 {
		q.AndWhere(dbx.In("state", states...))
	}
	var ors []dbx.Expression
	for i, l := range tq.Labels {
		if validLabel(l) {
			ors = append(ors, hasLabel("label"+string(rune('a'+i)), l))
		}
	}
	if len(ors) > 0 {
		q.AndWhere(dbx.Or(ors...))
	}
	if t := strings.TrimSpace(tq.Q); t != "" {
		q.AndWhere(dbx.NewExp(`title LIKE {:q} ESCAPE '\'`, dbx.Params{"q": "%" + escapeLike(t) + "%"}))
	}
	if err := q.Select("count(*)").Row(&res.TotalItems); err != nil {
		return res, err
	}
	// dbx quotes plain terms as column names, so the CASE is in parentheses and the sort keys
	// are selected under aliases.
	var rows []struct {
		ID string `db:"id"`
	}
	err := q.Select("id",
		"(CASE state WHEN 'draft' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END) AS stateRank",
		"COALESCE(NULLIF(publishedAt, ''), NULLIF(publishAt, ''), updated) AS sortTime",
	).OrderBy("stateRank ASC", "sortTime DESC", "id DESC").
		Limit(perPage).Offset(int64((tq.Page - 1) * perPage)).All(&rows)
	if err != nil {
		return res, err
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	recs, err := byIDs(s.App, ids)
	if err != nil {
		return res, err
	}
	for _, r := range recs {
		res.Items = append(res.Items, teamPost(s.App, r))
	}
	return res, nil
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// Create starts an empty draft written by actor (the admin's team profile; may be nil).
func (s *Service) Create(actor *core.Record) (string, error) {
	c, err := s.App.FindCollectionByNameOrId(schema.Changelogs)
	if err != nil {
		return "", err
	}
	r := core.NewRecord(c)
	r.Set("state", Draft)
	if actor != nil {
		r.Set("author", actor.Id)
	}
	if err := s.App.Save(r); err != nil {
		return "", err
	}
	return r.Id, nil
}

// Editor loads a post for the editor, any state.
func (s *Service) Editor(id string) (EditorPost, error) {
	r, err := find(s.App, id)
	if err != nil {
		return EditorPost{}, err
	}
	return s.editorPost(r)
}

func (s *Service) editorPost(r *core.Record) (EditorPost, error) {
	attached, err := requests.New(s.App).ItemsByID(r.GetStringSlice("requests"), nil, true)
	if err != nil {
		return EditorPost{}, err
	}
	images := r.GetStringSlice("images")
	if images == nil {
		images = []string{}
	}
	return EditorPost{
		TeamPost: teamPost(s.App, r), Body: r.GetString("body"), Cover: r.GetString("cover"),
		Excerpt: r.GetString("excerpt"), Images: images, SlugCustom: r.GetBool("slugCustom"),
		CompleteAttached: r.GetBool("completeAttached"), Attached: attached,
	}, nil
}
