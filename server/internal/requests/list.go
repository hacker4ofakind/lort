package requests

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Query is what the board and the dashboard table ask for.
type Query struct {
	Sort       string   // trending (default), newest, oldest, top, updated, shipped
	Statuses   []string // empty means every status
	Boards     []string // board ids
	Tags       []string // tag ids; a request matches if it has any of them
	Visibility string   // team only: "public", "hidden" or ""
	Search     string
	Page       int // 1-based
	PerPage    int

	StatusSince time.Time // not from the URL: only requests that entered their status at or after this
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
	StatusChangedAt  time.Time `json:"statusChangedAt"` // when it entered its current status
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
	return s.list(q, viewer, viewer, team, false)
}

// list is List with the two viewers apart: scopeAs decides which requests are in scope (nil
// drops the author's own-hidden exception), viewer decorates them (voted). noBody blanks Body.
func (s *Service) list(q Query, scopeAs, viewer *core.Record, team, noBody bool) (Page, error) {
	if q.PerPage <= 0 || q.PerPage > 100 {
		q.PerPage = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	base, err := s.filter(q, scopeAs, team)
	if err != nil {
		return Page{}, err
	}

	var total int
	if err := base.Select("count(*)").Row(&total); err != nil {
		return Page{}, err
	}

	var ids []string
	err = base.Select("r.id").OrderBy(order(q.Sort)...).Limit(int64(q.PerPage)).Offset(int64((q.Page - 1) * q.PerPage)).Column(&ids)
	if err != nil {
		return Page{}, err
	}
	items, err := s.itemsWith(ids, viewer, team, noBody)
	if err != nil {
		return Page{}, err
	}
	return Page{Items: items, Page: q.Page, PerPage: q.PerPage, TotalItems: total}, nil
}

// filter is the FROM and WHERE shared by List and Queue.
func (s *Service) filter(q Query, viewer *core.Record, team bool) (*dbx.SelectQuery, error) {
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
	if !q.StatusSince.IsZero() {
		since, err := types.ParseDateTime(q.StatusSince)
		if err != nil {
			return nil, err
		}
		// Bound as PocketBase's stored text ("2006-01-02 15:04:05.000Z"), not RFC3339: the "T"
		// sorts after the stored space and would put same-day rows on the wrong side.
		where = append(where, dbx.NewExp("r.statusChangedAt >= {:since}", dbx.Params{"since": since.String()}))
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
	if words := searchWords(q.Search); len(words) > 0 {
		var vocab []string
		for _, w := range words {
			if maxEdits(w) > 0 {
				// The index's distinct (stemmed) words, for typo matches.
				if err := s.App.DB().NewQuery("SELECT term FROM requests_fts_vocab").Column(&vocab); err != nil {
					return nil, err
				}
				break
			}
		}
		m := searchQuery(q.Search, vocab)
		where = append(where, dbx.NewExp("r.rowid IN (SELECT rowid FROM requests_fts WHERE requests_fts MATCH {:fts})", dbx.Params{"fts": m}))
	}
	return s.App.DB().Select().From("requests r").InnerJoin("boards b", dbx.NewExp("b.id = r.board")).Where(dbx.And(where...)), nil
}

// order is the ORDER BY for a sort name; trending is the default.
func order(sort string) []string {
	switch sort {
	case "newest":
		return []string{"r.created DESC"}
	case "oldest":
		return []string{"r.created ASC"}
	case "top":
		return []string{"r.upvoteCount DESC", "r.created DESC"}
	case "updated":
		return []string{"r.updated DESC"}
	case "shipped":
		return []string{"r.statusChangedAt DESC", "r.created DESC"}
	}
	return []string{"r.trendScore DESC", "r.created DESC"}
}

// QueueInfo is where a request sits in the dashboard's current filtered list.
type QueueInfo struct {
	Position int    `json:"position"` // 1-based; 0 when the request is not in the list
	Total    int    `json:"total"`
	Next     string `json:"next"` // the request Skip opens; "" at the end of the list
}

// queueMax caps how many ids Queue reads; Skip past it starts again from the top.
const queueMax = 1000

// Queue finds current in the team's list for q and the request after it. When current has
// left the list (its status changed), Next is the first request of the list.
func (s *Service) Queue(q Query, current string) (QueueInfo, error) {
	var info QueueInfo
	base, err := s.filter(q, nil, true)
	if err != nil {
		return info, err
	}
	if err := base.Select("count(*)").Row(&info.Total); err != nil {
		return info, err
	}
	var ids []string
	if err := base.Select("r.id").OrderBy(order(q.Sort)...).Limit(queueMax).Column(&ids); err != nil {
		return info, err
	}
	for i, id := range ids {
		if id == current {
			info.Position = i + 1
			if i+1 < len(ids) {
				info.Next = ids[i+1]
			}
			return info, nil
		}
	}
	if len(ids) > 0 && ids[0] != current {
		info.Next = ids[0]
	}
	return info, nil
}

// Similar finds up to limit public, open requests whose title or body match text.
func (s *Service) Similar(text string, limit int) ([]Item, error) {
	page, err := s.List(Query{Search: text, Statuses: []string{"pending", "reviewing", "planned", "progress"}, PerPage: limit, Sort: "top"}, nil, false)
	return page.Items, err
}

// ItemsByID loads requests in the order of ids, without bodies, for lists that link to them (a
// changelog post's shipped requests). The public view (team false) keeps only requests anyone
// could open, like the roadmap: visible, on a public board, not merged, with no exception for the
// viewer's own hidden ones; viewer only decides which show as voted. Missing ids are skipped.
func (s *Service) ItemsByID(ids []string, viewer *core.Record, team bool) ([]Item, error) {
	if len(ids) == 0 {
		return []Item{}, nil
	}
	keep := ids
	if !team {
		base, err := s.filter(Query{}, nil, false)
		if err != nil {
			return nil, err
		}
		var allowed []string
		if err := base.Select("r.id").AndWhere(dbx.In("r.id", anys(ids)...)).Column(&allowed); err != nil {
			return nil, err
		}
		ok := make(map[string]bool, len(allowed))
		for _, id := range allowed {
			ok[id] = true
		}
		keep = make([]string, 0, len(allowed))
		for _, id := range ids {
			if ok[id] {
				keep = append(keep, id)
			}
		}
	}
	return s.itemsWith(keep, viewer, team, true)
}

// items loads records for ids (keeping their order) and decorates them.
func (s *Service) items(ids []string, viewer *core.Record, team bool) ([]Item, error) {
	return s.itemsWith(ids, viewer, team, false)
}

// itemsWith is items with the option to leave Body empty, for views that never show it.
func (s *Service) itemsWith(ids []string, viewer *core.Record, team, noBody bool) ([]Item, error) {
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
			StatusChangedAt: r.GetDateTime("statusChangedAt").Time(),
		}
		if noBody {
			it.Body = ""
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

func anys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
