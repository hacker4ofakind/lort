package requests

import (
	"errors"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var ErrNoBoard = errors.New("pick a board that exists")

// Detail is everything a request page shows.
type Detail struct {
	Item
	Images     []string   `json:"images"`
	MergedInto *Ref       `json:"mergedInto"`
	Activity   []Activity `json:"activity"`
	// Thread is the comments with their replies. (Item.Comments is the count.)
	Thread []Comment `json:"thread"`
}

// Activity is one timeline entry.
type Activity struct {
	ID      string    `json:"id"`
	Kind    string    `json:"kind"`
	Actor   Person    `json:"actor"`
	From    string    `json:"from"`
	To      string    `json:"to"`
	Created time.Time `json:"created"`
}

// Comment is a top-level comment with its replies, or a reply (Replies empty).
type Comment struct {
	ID       string    `json:"id"`
	Body     string    `json:"body"`
	Images   []string  `json:"images"`
	Internal bool      `json:"internal"`
	Author   Person    `json:"author"`
	Created  time.Time `json:"created"`
	Replies  []Comment `json:"replies"`
}

// Get returns a request page. team is a superuser; viewer is a signed-in board user or nil.
// Anyone who can't see the request gets ErrNotFound, the same as for a missing one.
func (s *Service) Get(id string, viewer *core.Record, team bool) (Detail, error) {
	r, err := s.find(s.App, id)
	if err != nil {
		return Detail{}, err
	}
	insider := team || (viewer != nil && viewer.GetBool("isAdmin"))
	if !insider {
		ok, err := publicOrOwn(s.App, r, viewer)
		if err != nil || !ok {
			return Detail{}, ErrNotFound
		}
	}
	items, err := s.items([]string{r.Id}, viewer, insider)
	if err != nil || len(items) == 0 {
		return Detail{}, ErrNotFound
	}
	d := Detail{Item: items[0], Images: r.GetStringSlice("images"), Activity: []Activity{}, Thread: []Comment{}}

	if target := r.GetString("mergedInto"); target != "" {
		if t, err := s.App.FindRecordById("requests", target); err == nil {
			if ok, _ := publicOrOwn(s.App, t, viewer); ok || insider {
				d.MergedInto = &Ref{ID: t.Id, Name: t.GetString("title")}
			}
		}
	}

	acts, err := s.App.FindRecordsByFilter("activity", "request = {:r}", "created", 0, 0, dbx.Params{"r": r.Id})
	if err != nil {
		return Detail{}, err
	}
	s.App.ExpandRecords(acts, []string{"actor"}, nil)
	for _, a := range acts {
		d.Activity = append(d.Activity, Activity{
			ID: a.Id, Kind: a.GetString("kind"), Actor: person(a.ExpandedOne("actor"), a.GetString("actorName")),
			From: a.GetString("from"), To: a.GetString("to"), Created: a.GetDateTime("created").Time(),
		})
	}

	filter := "request = {:r}"
	if !insider {
		filter += " && internal = false"
	}
	cs, err := s.App.FindRecordsByFilter("comments", filter, "created", 0, 0, dbx.Params{"r": r.Id})
	if err != nil {
		return Detail{}, err
	}
	s.App.ExpandRecords(cs, []string{"author"}, nil)
	index := map[string]int{}
	for _, c := range cs {
		cm := Comment{
			ID: c.Id, Body: c.GetString("body"), Images: c.GetStringSlice("images"), Internal: c.GetBool("internal"),
			Author: person(c.ExpandedOne("author"), "Deleted account"), Created: c.GetDateTime("created").Time(), Replies: []Comment{},
		}
		if p := c.GetString("parent"); p != "" {
			if i, ok := index[p]; ok {
				d.Thread[i].Replies = append(d.Thread[i].Replies, cm)
			}
			continue
		}
		index[c.Id] = len(d.Thread)
		d.Thread = append(d.Thread, cm)
	}
	return d, nil
}

// publicOrOwn matches the requests view rule: visible on a public board, or the viewer's own.
func publicOrOwn(app core.App, r *core.Record, viewer *core.Record) (bool, error) {
	if viewer != nil && r.GetString("author") == viewer.Id {
		return true, nil
	}
	if !r.GetBool("visible") {
		return false, nil
	}
	b, err := app.FindRecordById("boards", r.GetString("board"))
	if err != nil {
		return false, err
	}
	return b.GetBool("isPublic"), nil
}

func person(r *core.Record, fallback string) Person {
	if r == nil {
		return Person{Name: fallback}
	}
	return Person{ID: r.Id, Name: r.GetString("name"), Avatar: r.GetString("avatar"), Team: r.GetBool("isAdmin")}
}

// MoveBoard moves a request to another board and records it on the timeline.
func (s *Service) MoveBoard(requestID, boardID string, actor *core.Record) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		to, err := tx.FindRecordById("boards", boardID)
		if err != nil {
			return ErrNoBoard
		}
		if r.GetString("board") == to.Id {
			return nil
		}
		fromName := ""
		if from, err := tx.FindRecordById("boards", r.GetString("board")); err == nil {
			fromName = from.GetString("name")
		}
		r.Set("board", to.Id)
		if err := tx.Save(r); err != nil {
			return err
		}
		return logActivity(tx, r.Id, actor, "board_changed", fromName, to.GetString("name"))
	})
}

// Stats are the dashboard's counts. Merged requests are left out.
type Stats struct {
	Total   int64 `json:"total"`
	Waiting int64 `json:"waiting"` // pending or reviewing
	New     int64 `json:"new"`     // not opened by the team yet
}

func (s *Service) Stats() (Stats, error) {
	live := dbx.HashExp{"mergedInto": ""}
	var st Stats
	var err error
	if st.Total, err = s.App.CountRecords("requests", live); err != nil {
		return st, err
	}
	if st.Waiting, err = s.App.CountRecords("requests", live, dbx.In("status", "pending", "reviewing")); err != nil {
		return st, err
	}
	st.New, err = s.App.CountRecords("requests", live, dbx.HashExp{"teamSeenAt": ""})
	return st, err
}
