// Command lort is the whole Lort server: PocketBase, Lort's rules and API, HTTPS, and the
// supervisor and proxy for the Next.js web app.
package main

import (
	"context"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/hooks"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

func main() {
	cfg := config.FromEnv()
	if len(os.Args) == 1 {
		os.Args = append(os.Args, cfg.ServeArgs()...)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: cfg.DataDir})
	svc := requests.New(app)
	hooks.Register(app, svc)

	webURL, err := url.Parse(cfg.WebURL)
	if err != nil {
		log.Fatalf("LORT_WEB_URL: %v", err)
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := schema.Ensure(se.App); err != nil {
			return err
		}
		if err := team.SeedFirstAdmin(se.App, cfg.AdminEmail, cfg.AdminPassword); err != nil {
			return err
		}
		se.App.Cron().MustAdd("lort_trending", "0 * * * *", func() {
			if err := svc.RecomputeTrending(); err != nil {
				se.App.Logger().Error("trending", "err", err)
			}
		})

		if !cfg.PBAdmin {
			se.Router.BindFunc(func(e *core.RequestEvent) error {
				if strings.HasPrefix(e.Request.URL.Path, "/_/") {
					return e.NotFoundError("", nil)
				}
				return e.Next()
			})
		}
		api.Register(se, api.Deps{Svc: svc, Cfg: cfg})
		se.Router.Any("/{path...}", web.Proxy(webURL, func() string { return api.BrandHeader(se.App) }))

		if len(cfg.WebCmd) > 0 {
			ctx, cancel := context.WithCancel(context.Background())
			se.App.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
				cancel()
				return e.Next()
			})
			go web.Supervise(ctx, cfg.WebCmd, se.App.Logger())
		}
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
