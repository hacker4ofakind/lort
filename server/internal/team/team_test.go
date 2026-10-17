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

func TestInviteRevokesUnverifiedProfileCredentials(t *testing.T) {
	app := testutil.NewApp(t)
	squatter := testutil.User(t, app, "sofia@driftnote.app")
	squatter.SetVerified(false)
	if err := app.Save(squatter); err != nil {
		t.Fatal(err)
	}
	oldToken := testutil.Token(t, squatter)
	if _, err := team.Invite(app, "https://f.example", "sofia@driftnote.app"); err != nil {
		t.Fatal(err)
	}
	p, _ := app.FindAuthRecordByEmail("users", "sofia@driftnote.app")
	if !p.GetBool("isAdmin") {
		t.Fatal("invitee's profile should be promoted")
	}
	if _, err := app.FindAuthRecordByToken(oldToken, core.TokenTypeAuth); err == nil {
		t.Error("the unverified account's old token still works after promotion")
	}
	if p.ValidatePassword("correcthorse") {
		t.Error("the unverified account's password still works after promotion")
	}
}

func TestInviteKeepsVerifiedProfileCredentials(t *testing.T) {
	app := testutil.NewApp(t)
	owner := testutil.User(t, app, "sofia@driftnote.app")
	if _, err := team.Invite(app, "https://f.example", "sofia@driftnote.app"); err != nil {
		t.Fatal(err)
	}
	p, _ := app.FindAuthRecordByEmail("users", "sofia@driftnote.app")
	if !p.ValidatePassword("correcthorse") || p.TokenKey() != owner.TokenKey() {
		t.Error("a verified owner should keep their sign-in")
	}
}

func TestUserByEmail(t *testing.T) {
	app := testutil.NewApp(t)
	mara := testutil.User(t, app, "mara@example.com")
	if u, err := team.UserByEmail(app, " mara@example.com "); err != nil || u.Id != mara.Id {
		t.Fatalf("existing = %v, %v", u, err)
	}
	u, err := team.UserByEmail(app, "priya@example.com")
	if err != nil || u.Verified() || u.GetString("name") != "priya" {
		t.Fatalf("new = %v, %v", u, err)
	}
	if _, err := team.UserByEmail(app, "not an email"); !errors.Is(err, team.ErrBadEmail) {
		t.Errorf("bad email err = %v", err)
	}
}
