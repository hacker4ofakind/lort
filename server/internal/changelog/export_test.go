package changelog

// Test seams for the scheduled publish, reachable from the external test package only.

func (s *Service) SetBetween(f func(id string))        { s.between = f }
func (s *Service) SetFailSave(f func(id string) error) { s.failSave = f }

var CapRunes = capRunes
var Referenced = referenced
