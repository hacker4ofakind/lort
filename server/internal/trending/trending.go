// Package trending scores requests for the Trending sort.
package trending

import (
	"math"
	"time"
)

// Score is votes / (ageHours + 2)^1.5: new requests with a few votes can outrank old ones with many.
func Score(votes int, created, now time.Time) float64 {
	age := now.Sub(created).Hours()
	if age < 0 {
		age = 0
	}
	return float64(votes) / math.Pow(age+2, 1.5)
}
