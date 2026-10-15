package team_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestNameFromEmail(t *testing.T) {
	if got := team.NameFromEmail("priya.s@example.com"); got != "priya.s" {
		t.Errorf("got %q", got)
	}
}

func TestSeedFirstAdminOnlyOnce(t *testing.T) {
	app := testutil.NewApp(t)
	if err := team.SeedFirstAdmin(app, "luk@driftnote.app", "correcthorse"); err != nil {
		t.Fatal(err)
	}
	if err := team.SeedFirstAdmin(app, "someone@else.com", "correcthorse"); err != nil {
		t.Fatal(err)
	}
	if n, _ := app.CountRecords(core.CollectionNameSuperusers); n != 1 {
		t.Fatalf("superusers = %d", n)
	}
	p, err := app.FindAuthRecordByEmail("users", "luk@driftnote.app")
	if err != nil || !p.GetBool("isAdmin") || p.GetString("name") != "luk" {
		t.Fatalf("profile = %v, %v", p, err)
	}
}

func TestInviteAndRemove(t *testing.T) {
	app := testutil.NewApp(t)
	luk := testutil.Superuser(t, app, "luk@driftnote.app")
	link, err := team.Invite(app, "https://feedback.driftnote.app/", "sofia@driftnote.app")
	if err != nil || !strings.HasPrefix(link, "https://feedback.driftnote.app/dashboard/invite?token=") {
		t.Fatalf("link = %q, %v", link, err)
	}
	members, _ := team.List(app)
	if len(members) != 2 || members[1].Name != "sofia" {
		t.Fatalf("members = %+v", members)
	}
	if err := team.Remove(app, luk, luk.Id); !errors.Is(err, team.ErrRemoveSelf) {
		t.Errorf("remove self = %v", err)
	}
	if err := team.Remove(app, luk, members[1].ID); err != nil {
		t.Fatal(err)
	}
	p, _ := app.FindAuthRecordByEmail("users", "sofia@driftnote.app")
	if p.GetBool("isAdmin") {
		t.Error("removed admin's profile should be demoted")
	}
}

func TestRemoveRefusesLastAdmin(t *testing.T) {
	app := testutil.NewApp(t)
	luk := testutil.Superuser(t, app, "luk@driftnote.app")
	other := testutil.Superuser(t, app, "x@driftnote.app")
	if err := app.Delete(luk); err != nil {
		t.Fatal(err)
	}
	if err := team.Remove(app, luk, other.Id); !errors.Is(err, team.ErrLastAdmin) {
		t.Errorf("err = %v", err)
	}
}

func TestBanAndSummary(t *testing.T) {
	app := testutil.NewApp(t)
	b := testutil.Board(t, app, "Features", true, false)
	devon := testutil.User(t, app, "devon@example.com")
	testutil.Request(t, app, b, devon, "Export", "pending", 0)
	if err := team.SetBanned(app, devon.Id, true); err != nil {
		t.Fatal(err)
	}
	s, err := team.UserSummary(app, devon.Id)
	if err != nil || !s.Banned || s.Requests != 1 || s.Email != "devon@example.com" {
		t.Fatalf("summary = %+v, %v", s, err)
	}
	link, err := team.ResetLink(app, "https://f.example", devon.Id)
	if err != nil || !strings.HasPrefix(link, "https://f.example/reset-password?token=") {
		t.Fatalf("reset link = %q, %v", link, err)
	}
}
