// Command lort is the whole Lort server: PocketBase, Lort's rules and API, HTTPS, and the
// supervisor and proxy for the Next.js web app.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/hooks"
	"github.com/hacker4ofakind/lort/server/internal/proxytrust"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/site"
	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

var (
	errWrongKey = errors.New("This board's data was saved with a different LORT_ENCRYPTION_KEY, so Lort can't read its settings. " +
		"Put the original LORT_ENCRYPTION_KEY back in .env, then start Lort again. " +
		"If .env lost it, `docker inspect lort` may still show it on the LORT_ENCRYPTION_KEY line.")
	errMissingKey = errors.New("This board's settings are encrypted, but LORT_ENCRYPTION_KEY is empty. " +
		"Put the original LORT_ENCRYPTION_KEY back in .env, then start Lort again.")
)

// webGrace is how long Next gets to finish after SIGTERM. Docker waits 10 seconds in all.
const webGrace = 5 * time.Second

func main() {
	log.SetFlags(log.LstdFlags)
	// These run before PocketBase exists: PocketBase opens (and creates) the database for
	// every command it knows, and setup must not make one before .env holds the key.
	if len(os.Args) > 1 {
		if cmd, ok := early[os.Args[1]]; ok {
			os.Exit(cmd(os.Args[2:]))
		}
	}

	if len(os.Args) > 1 && os.Args[1] == "reset-admin" && os.Geteuid() == 0 {
		fail(errors.New("Run this as the lort user, so the database keeps its owner: docker exec -it -u lort lort lort reset-admin"))
	}

	cfg := config.FromEnv()
	serving := len(os.Args) == 1 || os.Args[1] == "serve"
	if len(os.Args) == 1 {
		os.Args = append(os.Args, cfg.ServeArgs()...)
	}
	if serving {
		if err := cfg.Check(); err != nil {
			fail(err)
		}
		if err := config.CheckWritable(cfg.DataDir); err != nil {
			fail(err)
		}
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: cfg.DataDir, DefaultEncryptionEnv: config.EncryptionEnv})
	register(app, cfg)
	addCommands(app)
	if err := app.Start(); err != nil {
		err = explainBootstrap(err)
		if os.Args[1] == "setup-admin" {
			// Exit 1 means "no admin" to the wizard, so a failure must say "couldn't tell".
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		fail(err)
	}
}

// early holds the subcommands that run without PocketBase.
var early = map[string]func(args []string) int{
	"healthcheck": healthcheck,
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

// explainBootstrap turns PocketBase's bare key errors into what the owner should do.
func explainBootstrap(err error) error {
	if err == nil {
		return nil
	}
	switch msg := err.Error(); {
	case strings.Contains(msg, "cipher: message authentication failed"):
		return errWrongKey
	case strings.Contains(msg, "missing encryption key"):
		return errMissingKey
	}
	return err
}

// register wires Lort into app: hooks, routes, proxy trust, the web proxy and its supervisor.
func register(app core.App, cfg config.Config) {
	svc := requests.New(app)
	hooks.Register(app, svc)
	siteCfg := site.NewCache(app)

	webURL, err := url.Parse(cfg.WebURL)
	if err != nil {
		fail(fmt.Errorf("LORT_WEB_URL: %w", err))
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Without a superuser PocketBase makes __pbinstaller@example.com and logs a link that
		// signs in as it. Lort's admin comes from setup instead.
		se.InstallerFunc = nil
		se.Server.ReadHeaderTimeout = 10 * time.Second
		host := ""
		if cfg.TLS == "auto" {
			if u, err := url.Parse(cfg.URL); err == nil {
				host = u.Hostname()
			}
		}
		se.Server.ErrorLog = log.New(newTLSLog(se.App, host, os.Stderr), "", 0)

		if err := schema.Ensure(se.App); err != nil {
			return err
		}
		if err := proxytrust.TrustProxy(se.App, cfg.BehindProxy()); err != nil {
			return err
		}
		se.Router.Bind(proxytrust.Middleware(cfg.BehindProxy()))
		if err := team.SeedFirstAdmin(se.App, cfg.AdminEmail, cfg.AdminPassword); err != nil {
			return err
		}
		se.App.Cron().MustAdd("lort_trending", "0 * * * *", func() {
			if err := svc.RecomputeTrending(); err != nil {
				log.Printf("Couldn't recompute trending: %v", err)
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
		api.Register(se, api.Deps{Svc: svc, Cfg: cfg, Site: siteCfg})
		se.Router.Any("/{path...}", web.Proxy(webURL, siteCfg.Header, web.ProxyOptions{HSTS: cfg.TLS == "auto"}))

		if len(cfg.WebCmd) > 0 {
			ctx, cancel := context.WithCancel(context.Background())
			stopped := make(chan struct{})
			go func() {
				if web.Supervise(ctx, cfg.WebCmd, web.Options{Grace: webGrace}).Killed {
					log.Printf("The web server didn't stop within %s, so it was killed.", webGrace)
				}
				log.Print("The web server has stopped.")
				close(stopped)
			}()
			se.App.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
				cancel()
				<-stopped
				return e.Next()
			})
		}
		return se.Next()
	})
}
