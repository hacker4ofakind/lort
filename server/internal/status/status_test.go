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
