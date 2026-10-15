package trending

import (
	"math"
	"testing"
	"time"
)

func TestScore(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	if got := Score(8, now, now); math.Abs(got-8/math.Pow(2, 1.5)) > 1e-9 {
		t.Errorf("fresh request = %v", got)
	}
	fresh := Score(5, now.Add(-2*time.Hour), now)
	old := Score(50, now.Add(-14*24*time.Hour), now)
	if fresh <= old {
		t.Errorf("a 2-hour-old request with 5 votes (%v) should outrank a 2-week-old one with 50 (%v)", fresh, old)
	}
	if got := Score(3, now.Add(time.Hour), now); got != Score(3, now, now) {
		t.Errorf("future created dates count as age 0, got %v", got)
	}
}
