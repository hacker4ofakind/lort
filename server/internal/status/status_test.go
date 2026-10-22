package status

import "testing"

func TestNext(t *testing.T) {
	cases := []struct {
		from   Status
		action Action
		want   Status
	}{
		{Pending, Accept, Reviewing},
		{Pending, Close, Closed},
		{Reviewing, Roadmap, Planned},
		{Reviewing, Close, Closed},
		{Planned, Rereview, Reviewing},
		{Planned, Start, Progress},
		{Progress, Complete, Completed},
		{Completed, Reopen, Progress},
		{Closed, Reopen, Pending},
	}
	for _, c := range cases {
		got, err := Next(c.from, c.action)
		if err != nil || got != c.want {
			t.Errorf("Next(%s, %s) = %q, %v; want %q", c.from, c.action, got, err, c.want)
		}
	}
}

func TestNextRejectsUnavailableActions(t *testing.T) {
	for _, c := range []struct {
		from   Status
		action Action
	}{
		{Pending, Complete},
		{Progress, Close},
		{Completed, Accept},
		{Planned, Roadmap},
	} {
		if _, err := Next(c.from, c.action); err == nil {
			t.Errorf("Next(%s, %s) should fail", c.from, c.action)
		}
	}
}

func TestRoadmapChange(t *testing.T) {
	if got := RoadmapChange(Reviewing, Planned); got != "added" {
		t.Errorf("reviewing→planned = %q", got)
	}
	if got := RoadmapChange(Planned, Reviewing); got != "removed" {
		t.Errorf("planned→reviewing = %q", got)
	}
	if got := RoadmapChange(Planned, Progress); got != "" {
		t.Errorf("planned→progress = %q", got)
	}
	if got := RoadmapChange(Closed, Pending); got != "" {
		t.Errorf("closed→pending = %q", got)
	}
}

func TestRoadmapMove(t *testing.T) {
	cols := []Status{Planned, Progress, Completed}
	for _, from := range cols {
		for _, to := range cols {
			err := RoadmapMove(from, to)
			if from == to && err == nil {
				t.Errorf("%s → %s should be refused", from, to)
			}
			if from != to && err != nil {
				t.Errorf("%s → %s = %v", from, to, err)
			}
		}
	}
	for _, c := range []struct{ from, to Status }{
		{Reviewing, Planned}, {Planned, Reviewing}, {Closed, Completed}, {Progress, Pending}, {Planned, "bogus"},
	} {
		if err := RoadmapMove(c.from, c.to); err == nil {
			t.Errorf("%s → %s should be refused", c.from, c.to)
		}
	}
}

func TestShip(t *testing.T) {
	for _, s := range []Status{Pending, Reviewing, Planned, Progress} {
		if err := Ship(s); err != nil {
			t.Errorf("Ship(%s) = %v", s, err)
		}
	}
	for _, s := range []Status{Completed, Closed, "nope"} {
		if err := Ship(s); err == nil {
			t.Errorf("Ship(%s) should fail", s)
		}
	}
}
