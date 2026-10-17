package requests

import (
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Comment is one comment on a request page, with its replies (one level deep).
type Comment struct {
	ID       string    `json:"id"`
	Body     string    `json:"body"`
	Images   []string  `json:"images"`
	Internal bool      `json:"internal"`
	Author   Person    `json:"author"`
	Created  time.Time `json:"created"`
	Replies  []Comment `json:"replies"`
}

// Event is one timeline entry: created, status_changed, merged_in, merged_from or board_changed.
type Event struct {
	ID      string    `json:"id"`
	Kind    string    `json:"kind"`
	Actor   Person    `json:"actor"`
	From    string    `json:"from"`
	To      string    `json:"to"`
	Ref     *Ref      `json:"ref"` // the other request of a merge, when the viewer may see it
	Created time.Time `json:"created"`
}

// Detail is everything a request page shows, in one response. The comment list is called
// thread because Item already has a comments field (the count); Go's JSON encoder silently
// drops one of two fields with the same name.
type Detail struct {
	Item
	Images     []string  `json:"images"`
	Public     bool      `json:"public"` // visible on a public board, so its images load without a file token
	MergedInto *Ref      `json:"mergedInto"`
	Thread     []Comment `json:"thread"`
	Activity   []Event   `json:"activity"`
}

// Detail loads a request page. viewer may be nil. team is the dashboard's view: any request,
// internal comments included. Anyone else gets ErrNotFound for a request they may not see.
func (s *Service) Detail(id string, viewer *core.Record, team bool) (Detail, error) {
	r, err := s.find(s.App, id)
	if err != nil {
		return Detail{}, err
	}
	public, err := isPublic(s.App, r)
	if err != nil {
		return Detail{}, err
	}
	if !team && !public {
		if viewer == nil {
			return Detail{}, ErrNotFound
		}
		if ok, err := canSee(s.App, r, viewer.Id); err != nil || !ok {
			return Detail{}, ErrNotFound
		}
	}
	items, err := s.items([]string{r.Id}, viewer, team)
	if err != nil || len(items) == 0 {
		return Detail{}, ErrNotFound
	}
	d := Detail{Item: items[0], Images: r.GetStringSlice("images"), Public: public}
	if target := r.GetString("mergedInto"); target != "" {
		d.MergedInto = s.visibleRef(target, viewer, team)
	}
	if d.Thread, err = s.thread(r.Id, team); err != nil {
		return Detail{}, err
	}
	if d.Activity, err = s.activity(r.Id, viewer, team); err != nil {
		return Detail{}, err
	}
	return d, nil
}

// isPublic reports whether anyone may see r: visible and on a public board.
func isPublic(app core.App, r *core.Record) (bool, error) {
	if !r.GetBool("visible") {
		return false, nil
	}
	b, err := app.FindRecordById("boards", r.GetString("board"))
	if err != nil {
		return false, err
	}
	return b.GetBool("isPublic"), nil
}

// visibleRef returns the id and title of request id, or nil if the viewer may not see it.
func (s *Service) visibleRef(id string, viewer *core.Record, team bool) *Ref {
	r, err := s.find(s.App, id)
	if err != nil {
		return nil
	}
	if !team {
		public, err := isPublic(s.App, r)
		if err != nil {
			return nil
		}
		if !public {
			if viewer == nil {
				return nil
			}
			if ok, err := canSee(s.App, r, viewer.Id); err != nil || !ok {
				return nil
			}
		}
	}
	return &Ref{ID: r.Id, Name: r.GetString("title")}
}

func person(r *core.Record) Person {
	if r == nil {
		return Person{}
	}
	return Person{ID: r.Id, Name: r.GetString("name"), Avatar: r.GetString("avatar"), Team: r.GetBool("isAdmin")}
}

// thread returns the request's comments oldest first, replies nested under their parent.
func (s *Service) thread(requestID string, team bool) ([]Comment, error) {
	filter := "request = {:r}"
	if !team {
		filter += " && internal = false"
	}
	recs, err := s.App.FindRecordsByFilter("comments", filter, "created", 0, 0, dbx.Params{"r": requestID})
	if err != nil {
		return nil, err
	}
	if errs := s.App.ExpandRecords(recs, []string{"author"}, nil); len(errs) > 0 {
		for _, e := range errs {
			return nil, e
		}
	}
	top := []Comment{}
	replies := map[string][]Comment{}
	for _, c := range recs {
		cm := Comment{
			ID: c.Id, Body: c.GetString("body"), Images: c.GetStringSlice("images"), Internal: c.GetBool("internal"),
			Author: person(c.ExpandedOne("author")), Created: c.GetDateTime("created").Time(), Replies: []Comment{},
		}
		if p := c.GetString("parent"); p != "" {
			replies[p] = append(replies[p], cm)
		} else {
			top = append(top, cm)
		}
	}
	for i := range top {
		if rs, ok := replies[top[i].ID]; ok {
			top[i].Replies = rs
		}
	}
	return top, nil
}

// activity returns the request's timeline entries oldest first.
func (s *Service) activity(requestID string, viewer *core.Record, team bool) ([]Event, error) {
	recs, err := s.App.FindRecordsByFilter("activity", "request = {:r}", "created", 0, 0, dbx.Params{"r": requestID})
	if err != nil {
		return nil, err
	}
	if errs := s.App.ExpandRecords(recs, []string{"actor"}, nil); len(errs) > 0 {
		for _, e := range errs {
			return nil, e
		}
	}
	out := make([]Event, 0, len(recs))
	for _, a := range recs {
		ev := Event{
			ID: a.Id, Kind: a.GetString("kind"), From: a.GetString("from"), To: a.GetString("to"),
			Actor: person(a.ExpandedOne("actor")), Created: a.GetDateTime("created").Time(),
		}
		if ev.Actor.Name == "" {
			ev.Actor.Name = a.GetString("actorName")
		}
		switch ev.Kind {
		case "merged_in":
			ev.Ref = s.visibleRef(ev.To, viewer, team)
		case "merged_from":
			ev.Ref = s.visibleRef(ev.From, viewer, team)
		}
		out = append(out, ev)
	}
	return out, nil
}
