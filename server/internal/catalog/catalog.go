// Package catalog keeps the team's ordered lists: boards and tags.
package catalog

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// ErrNotOrderable is returned for a collection without a team-managed order.
var ErrNotOrderable = errors.New("only boards and tags can be reordered")

// SetOrder stores each record's position in ids (0-based) in one transaction. Records of the
// collection that ids leaves out keep their order after the listed ones.
func SetOrder(app core.App, collection string, ids []string) error {
	if collection != "boards" && collection != "tags" {
		return ErrNotOrderable
	}
	return app.RunInTransaction(func(tx core.App) error {
		recs, err := tx.FindRecordsByFilter(collection, "", "order", 0, 0)
		if err != nil {
			return err
		}
		pos := make(map[string]int, len(ids))
		for i, id := range ids {
			pos[id] = i
		}
		next := len(ids)
		for _, r := range recs {
			p, ok := pos[r.Id]
			if !ok {
				p = next
				next++
			}
			if r.GetInt("order") == p {
				continue
			}
			r.Set("order", p)
			if err := tx.Save(r); err != nil {
				return err
			}
		}
		return nil
	})
}
