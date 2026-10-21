package setup

import (
	"context"
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestResetFindsTheAdminWhateverTheCase(t *testing.T) {
	app := testutil.NewApp(t)
	testutil.Superuser(t, app, "case-admin@lort.test")
	testutil.Superuser(t, app, core.DefaultInstallerEmail)
	a := AppAdmin{App: app}
	ctx := context.Background()
	if ok, _ := a.Exists(ctx, "CASE-ADMIN@LORT.TEST"); !ok {
		t.Fatal("a differently cased email should find the admin")
	}
	if err := a.Reset(ctx, "CASE-ADMIN@LORT.TEST", "new password 1"); err != nil {
		t.Fatal(err)
	}
	su, _ := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "case-admin@lort.test")
	if !su.ValidatePassword("new password 1") {
		t.Error("the reset didn't reach the saved admin")
	}
	for _, e := range []string{core.DefaultInstallerEmail, "__PBINSTALLER@EXAMPLE.COM"} {
		if ok, _ := a.Exists(ctx, e); ok {
			t.Errorf("%s counted as an admin", e)
		}
		if err := a.Reset(ctx, e, "new password 1"); !errors.Is(err, ErrNoSuchAdmin) {
			t.Errorf("%s: reset = %v", e, err)
		}
	}
}

func TestResetWontGuessBetweenAdminsThatDifferByCase(t *testing.T) {
	app := testutil.NewApp(t)
	testutil.Superuser(t, app, "Dup@lort.test")
	testutil.Superuser(t, app, "dup@lort.test")
	a := AppAdmin{App: app}
	if ok, _ := a.Exists(context.Background(), "DUP@LORT.TEST"); ok {
		t.Error("an ambiguous email should not pick one of two admins")
	}
	if ok, _ := a.Exists(context.Background(), "dup@lort.test"); !ok {
		t.Error("the exact email should still work")
	}
}
