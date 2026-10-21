package requests

import (
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/status"
)

// Roadmap is the three columns of the roadmap and how many requests have ever shipped.
type Roadmap struct {
	Planned   []Item `json:"planned"`
	Progress  []Item `json:"progress"`
	Completed []Item `json:"completed"` // shipped in the last 30 days, newest first
	Shipped   int    `json:"shipped"`   // every completed request the viewer can see
}

const (
	// roadmapMax caps each column. A board with more than 200 planned requests is out of scope:
	// the roadmap is a short list by design, and the cap keeps every realtime refetch cheap.
	roadmapMax = 200
	// shippedWindow is how long a completed request stays in the Completed column.
	shippedWindow  = 30 * 24 * time.Hour
	shippedPerPage = 20
)

// Roadmap loads the roadmap. The public view (team false) shows only requests anyone could
// open: visible, on a public board, not merged. Unlike the feed it has no exception for the
// viewer's own hidden requests, so a page that everyone shares reads the same for everyone;
// viewer only decides which stickers show as voted. The team view shows every board and
// hidden requests. Items carry no body.
func (s *Service) Roadmap(viewer *core.Record, team bool) (Roadmap, error) {
	var rm Roadmap
	var err error
	if rm.Planned, err = s.roadmapColumn(status.Planned, "top", time.Time{}, viewer, team); err != nil {
		return rm, err
	}
	if rm.Progress, err = s.roadmapColumn(status.Progress, "top", time.Time{}, viewer, team); err != nil {
		return rm, err
	}
	since := s.Now().Add(-shippedWindow)
	if rm.Completed, err = s.roadmapColumn(status.Completed, "shipped", since, viewer, team); err != nil {
		return rm, err
	}
	all, err := s.filter(Query{Statuses: []string{string(status.Completed)}}, nil, team)
	if err != nil {
		return rm, err
	}
	err = all.Select("count(*)").Row(&rm.Shipped)
	return rm, err
}

func (s *Service) roadmapColumn(st status.Status, sort string, since time.Time, viewer *core.Record, team bool) ([]Item, error) {
	base, err := s.filter(Query{Statuses: []string{string(st)}, StatusSince: since}, nil, team)
	if err != nil {
		return nil, err
	}
	var ids []string
	if err := base.Select("r.id").OrderBy(order(sort)...).Limit(roadmapMax).Column(&ids); err != nil {
		return nil, err
	}
	return s.itemsWith(ids, viewer, team, true)
}

// Shipped pages through every completed request, newest first, with the roadmap's visibility.
func (s *Service) Shipped(page int, viewer *core.Record, team bool) (Page, error) {
	q := Query{Statuses: []string{string(status.Completed)}, Sort: "shipped", Page: page, PerPage: shippedPerPage}
	return s.list(q, nil, viewer, team, true)
}

// MoveOnRoadmap moves a card between roadmap columns. from is the column the caller saw: if the
// request is somewhere else now, someone else moved it and this move is refused instead of
// silently undoing theirs. A move to the column the card is already in changes nothing.
func (s *Service) MoveOnRoadmap(id string, from, to status.Status, actor *core.Record) (Change, error) {
	return s.changeStatus(id, actor, func(r *core.Record) (status.Status, error) {
		current := status.Status(r.GetString("status"))
		if !status.OnRoadmap(current) {
			return "", ErrNotOnRoadmap
		}
		if to == current {
			return current, nil
		}
		if current != from {
			return "", ErrMoved
		}
		if err := status.RoadmapMove(from, to); err != nil {
			return "", err
		}
		return to, nil
	})
}
