// Package status holds Lort's request statuses and the triage rules between them.
package status

import "fmt"

type Status string

const (
	Pending   Status = "pending"
	Reviewing Status = "reviewing"
	Planned   Status = "planned"
	Progress  Status = "progress"
	Completed Status = "completed"
	Closed    Status = "closed"
)

// All lists every status in display order.
var All = []Status{Pending, Reviewing, Planned, Progress, Completed, Closed}

// Open is the default filter on the board and in the dashboard.
var Open = []Status{Pending, Reviewing, Planned, Progress}

type Action string

const (
	Close    Action = "close"
	Accept   Action = "accept"
	Roadmap  Action = "roadmap"
	Rereview Action = "rereview"
	Start    Action = "start"
	Complete Action = "complete"
	Reopen   Action = "reopen"
)

// actions maps a status to the actions the triage bar offers that change the status.
// Merge and Skip are not here: Merge has its own endpoint and Skip changes nothing.
var actions = map[Status]map[Action]Status{
	Pending:   {Close: Closed, Accept: Reviewing},
	Reviewing: {Close: Closed, Roadmap: Planned},
	Planned:   {Rereview: Reviewing, Start: Progress},
	Progress:  {Complete: Completed},
	Completed: {Reopen: Progress},
	Closed:    {Reopen: Pending},
}

// Valid reports whether s is a known status.
func Valid(s Status) bool {
	_, ok := actions[s]
	return ok
}

// Next returns the status that action moves a request in status from to.
func Next(from Status, action Action) (Status, error) {
	to, ok := actions[from][action]
	if !ok {
		return "", fmt.Errorf("%q is not available for a %s request", action, from)
	}
	return to, nil
}

// Ship checks that a request in from can be marked Completed because a changelog post that
// lists it went live: any open status, never Completed or Closed again.
func Ship(from Status) error {
	switch from {
	case Pending, Reviewing, Planned, Progress:
		return nil
	}
	return fmt.Errorf("a %s request can't be marked as shipped", from)
}

// OnRoadmap reports whether a status is shown on the roadmap.
func OnRoadmap(s Status) bool {
	return s == Planned || s == Progress || s == Completed
}

// RoadmapChange describes how a move affects the roadmap: "added", "removed" or "".
func RoadmapChange(from, to Status) string {
	switch {
	case !OnRoadmap(from) && OnRoadmap(to):
		return "added"
	case OnRoadmap(from) && !OnRoadmap(to):
		return "removed"
	default:
		return ""
	}
}

// RoadmapMove checks a drag on the roadmap board: any roadmap column to any other. The triage
// bar keeps its own, narrower table (Next); only the board moves freely.
func RoadmapMove(from, to Status) error {
	if !OnRoadmap(from) || !OnRoadmap(to) {
		return fmt.Errorf("the roadmap only moves cards between Planned, In progress and Completed")
	}
	if from == to {
		return fmt.Errorf("that card is already in %s", to)
	}
	return nil
}
