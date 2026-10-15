package requests

import (
	"strings"
	"time"
	"unicode"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Query is what the board and the dashboard table ask for.
type Query struct {
	Sort       string   // trending (default), newest, oldest, top, updated
	Statuses   []string // empty means every status
	Boards     []string // board ids
	Tags       []string // tag ids; a request matches if it has any of them
	Visibility string   // team only: "public", "hidden" or ""
	Search     string
	Page       int // 1-based
	PerPage    int
}

// Item is one request as the board and the table show it.
type Item struct {
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	Body             string    `json:"body"`
	Status           string    `json:"status"`
	Board            Ref       `json:"board"`
	Author           Person    `json:"author"`
	Tags             []Ref     `json:"tags"`
	Comments         int       `json:"comments"`
	Votes            int       `json:"votes"`
	Voted            bool      `json:"voted"`
	Visible          bool      `json:"visible"`
	AwaitingApproval bool      `json:"awaitingApproval"`
	New              bool      `json:"new"`
	Created          time.Time `json:"created"`
}

type Ref struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Person struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Team   bool   `json:"team"`
}

type Page struct {
	Items      []Item `json:"items"`
	Page       int    `json:"page"`
	PerPage    int    `json:"perPage"`
	TotalItems int    `json:"totalItems"`
}

// List returns one page of requests. viewer may be nil. team switches to the dashboard's
// view: every board, hidden requests, internal comments counted, "New" markers.
func (s *Service) List(q Query, viewer *core.Record, team bool) (Page, error) {
	if q.PerPage <= 0 || q.PerPage > 100 {
		q.PerPage = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	where := []dbx.Expression{dbx.HashExp{"r.mergedInto": ""}}
	if !team {
		public := dbx.And(dbx.HashExp{"r.visible": true}, dbx.NewExp("b.isPublic = 1"))
		if viewer != nil {
			public = dbx.Or(public, dbx.HashExp{"r.author": viewer.Id})
		}
		where = append(where, public)
	} else {
		switch q.Visibility {
		case "public":
			where = append(where, dbx.HashExp{"r.visible": true})
		case "hidden":
			where = append(where, dbx.HashExp{"r.visible": false})
		}
	}
	if len(q.Statuses) > 0 {
		where = append(where, dbx.In("r.status", anys(q.Statuses)...))
	}
	if len(q.Boards) > 0 {
		where = append(where, dbx.In("r.board", anys(q.Boards)...))
	}
	if len(q.Tags) > 0 {
		ors := make([]dbx.Expression, 0, len(q.Tags))
		for i, tag := range q.Tags {
			p := "tag" + string(rune('a'+i))
			ors = append(ors, dbx.NewExp("EXISTS (SELECT 1 FROM json_each(r.tags) WHERE value = {:"+p+"})", dbx.Params{p: tag}))
		}
		where = append(where, dbx.Or(ors...))
	}
	if m := ftsQuery(q.Search); m != "" {
		where = append(where, dbx.NewExp("r.rowid IN (SELECT rowid FROM requests_fts WHERE requests_fts MATCH {:fts})", dbx.Params{"fts": m}))
	}

	base := s.App.DB().Select().From("requests r").InnerJoin("boards b", dbx.NewExp("b.id = r.board")).Where(dbx.And(where...))

	var total int
	if err := base.Select("count(*)").Row(&total); err != nil {
		return Page{}, err
	}

	order := map[string][]string{
		"newest":  {"r.created DESC"},
		"oldest":  {"r.created ASC"},
		"top":     {"r.upvoteCount DESC", "r.created DESC"},
		"updated": {"r.updated DESC"},
	}[q.Sort]
	if order == nil {
		order = []string{"r.trendScore DESC", "r.created DESC"}
	}
	var ids []string
	err := base.Select("r.id").OrderBy(order...).Limit(int64(q.PerPage)).Offset(int64((q.Page - 1) * q.PerPage)).Column(&ids)
	if err != nil {
		return Page{}, err
	}
	items, err := s.items(ids, viewer, team)
	if err != nil {
		return Page{}, err
	}
	return Page{Items: items, Page: q.Page, PerPage: q.PerPage, TotalItems: total}, nil
}

// Similar finds up to limit public, open requests whose title or body match text.
func (s *Service) Similar(text string, limit int) ([]Item, error) {
	page, err := s.List(Query{Search: text, Statuses: []string{"pending", "reviewing", "planned", "progress"}, PerPage: limit, Sort: "top"}, nil, false)
	return page.Items, err
}

// items loads records for ids (keeping their order) and decorates them.
func (s *Service) items(ids []string, viewer *core.Record, team bool) ([]Item, error) {
	out := make([]Item, 0, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	recs, err := s.App.FindRecordsByIds("requests", ids)
	if err != nil {
		return nil, err
	}
	if errs := s.App.ExpandRecords(recs, []string{"board", "author", "tags"}, nil); len(errs) > 0 {
		for _, e := range errs {
			return nil, e
		}
	}
	byID := make(map[string]*core.Record, len(recs))
	for _, r := range recs {
		byID[r.Id] = r
	}

	voted := map[string]bool{}
	if viewer != nil {
		var mine []string
		err := s.App.DB().Select("request").From("votes").
			Where(dbx.And(dbx.HashExp{"user": viewer.Id}, dbx.In("request", anys(ids)...))).Column(&mine)
		if err != nil {
			return nil, err
		}
		for _, id := range mine {
			voted[id] = true
		}
	}

	type countRow struct {
		Request string `db:"request"`
		N       int    `db:"n"`
	}
	var counts []countRow
	cq := s.App.DB().Select("request", "count(*) AS n").From("comments").Where(dbx.In("request", anys(ids)...)).GroupBy("request")
	if !team {
		cq.AndWhere(dbx.HashExp{"internal": false})
	}
	if err := cq.All(&counts); err != nil {
		return nil, err
	}
	comments := map[string]int{}
	for _, c := range counts {
		comments[c.Request] = c.N
	}

	for _, id := range ids {
		r := byID[id]
		if r == nil {
			continue
		}
		it := Item{
			ID: r.Id, Title: r.GetString("title"), Body: r.GetString("body"), Status: r.GetString("status"),
			Comments: comments[r.Id], Votes: r.GetInt("upvoteCount"), Voted: voted[r.Id],
			Visible: r.GetBool("visible"), AwaitingApproval: r.GetBool("awaitingApproval"),
			Created: r.GetDateTime("created").Time(), Tags: []Ref{},
		}
		if team {
			it.New = r.GetDateTime("teamSeenAt").IsZero()
		}
		if b := r.ExpandedOne("board"); b != nil {
			it.Board = Ref{ID: b.Id, Name: b.GetString("name")}
		}
		if a := r.ExpandedOne("author"); a != nil {
			it.Author = Person{ID: a.Id, Name: a.GetString("name"), Avatar: a.GetString("avatar"), Team: a.GetBool("isAdmin")}
		}
		for _, tg := range r.ExpandedAll("tags") {
			it.Tags = append(it.Tags, Ref{ID: tg.Id, Name: tg.GetString("name")})
		}
		out = append(out, it)
	}
	return out, nil
}

// ftsQuery turns free text into a safe FTS5 prefix query: `"dark"* "mode"*`.
func ftsQuery(text string) string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	parts := make([]string, 0, len(words))
	for _, w := range words {
		if len(w) < 2 {
			continue
		}
		parts = append(parts, `"`+w+`"*`)
		if len(parts) == 8 {
			break
		}
	}
	return strings.Join(parts, " ")
}

func anys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
