// Package site builds the public configuration of the board (brand, boards, tags, features)
// and keeps it cached between changes.
package site

import (
	"encoding/base64"
	"encoding/json"
	"sync"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Version is Lort's version, set at build time with -ldflags "-X .../site.Version=1.0.0".
var Version = "dev"

type Ref struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Features are the optional services that are switched on. The web app hides everything
// that belongs to a feature that is off.
type Features struct {
	Email     bool `json:"email"`
	Voice     bool `json:"voice"`
	Turnstile bool `json:"turnstile"`
}

// Config is what every visitor may know about the board.
type Config struct {
	AppName         string   `json:"appName"`
	Logo            string   `json:"logo"`
	PrimaryColor    string   `json:"primaryColor"`
	ShowLandingCard bool     `json:"showLandingCard"`
	RoadmapPublic   bool     `json:"roadmapPublic"`
	Changelog       bool     `json:"changelog"` // at least one post is published
	Boards          []Ref    `json:"boards"`    // public boards, in order
	Tags            []Ref    `json:"tags"`
	Features        Features `json:"features"`
	Version         string   `json:"version"`
}

// Load reads the config from the database.
func Load(app core.App) (Config, error) {
	settings, err := app.FindFirstRecordByFilter("settings", "")
	if err != nil {
		return Config{}, err
	}
	logo := ""
	if f := settings.GetString("logo"); f != "" {
		logo = "/api/files/settings/" + settings.Id + "/" + f
	}
	boards, err := app.FindRecordsByFilter("boards", "isPublic = true", "order", 0, 0)
	if err != nil {
		return Config{}, err
	}
	tags, err := app.FindRecordsByFilter("tags", "", "order", 0, 0)
	if err != nil {
		return Config{}, err
	}
	published, err := app.CountRecords("changelogs", dbx.HashExp{"state": "published"})
	if err != nil {
		return Config{}, err
	}
	return Config{
		AppName:         settings.GetString("appName"),
		Logo:            logo,
		PrimaryColor:    settings.GetString("primaryColor"),
		ShowLandingCard: settings.GetBool("showLandingCard"),
		RoadmapPublic:   settings.GetBool("roadmapPublic"),
		Changelog:       published > 0,
		Boards:          refs(boards),
		Tags:            refs(tags),
		Version:         Version,
	}, nil
}

func refs(rs []*core.Record) []Ref {
	out := make([]Ref, len(rs))
	for i, r := range rs {
		out[i] = Ref{r.Id, r.GetString("name")}
	}
	return out
}

// Cache holds the config and its header encoding, and drops them whenever settings, boards
// or tags change, or a changelog post goes live or stops being live (after the change commits).
type Cache struct {
	app    core.App
	mu     sync.Mutex
	cfg    *Config
	header string
}

// NewCache returns a cache bound to app's record hooks.
func NewCache(app core.App) *Cache {
	c := &Cache{app: app}
	drop := func(e *core.RecordEvent) error {
		c.Invalidate()
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess("settings", "boards", "tags").BindFunc(drop)
	app.OnRecordAfterUpdateSuccess("settings", "boards", "tags").BindFunc(drop)
	app.OnRecordAfterDeleteSuccess("settings", "boards", "tags").BindFunc(drop)
	// Not on every changelog save: autosave writes about once a second while someone types.
	app.OnRecordAfterUpdateSuccess("changelogs").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("state") != e.Record.Original().GetString("state") {
			c.Invalidate()
		}
		return e.Next()
	})
	app.OnRecordAfterDeleteSuccess("changelogs").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("state") == "published" {
			c.Invalidate()
		}
		return e.Next()
	})
	return c
}

func (c *Cache) Invalidate() {
	c.mu.Lock()
	c.cfg, c.header = nil, ""
	c.mu.Unlock()
}

// Get returns the config, loading it when the cache is empty.
func (c *Cache) Get() (Config, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cfg != nil {
		return *c.cfg, nil
	}
	cfg, err := Load(c.app)
	if err != nil {
		return Config{}, err
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		return Config{}, err
	}
	c.cfg, c.header = &cfg, base64.RawURLEncoding.EncodeToString(b)
	return cfg, nil
}

// Header is the config as unpadded base64url JSON, for the X-Lort-Config request header
// (header values must be ASCII; app names may not be). It is "" if the config can't load.
func (c *Cache) Header() string {
	if _, err := c.Get(); err != nil {
		return ""
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.header
}
