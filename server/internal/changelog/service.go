package changelog

import (
	"errors"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
)

// These are shown as they are, so they read as sentences.
var (
	ErrNotFound     = errors.New("That post isn't here.")
	ErrLive         = errors.New("It's already live.")
	ErrNotScheduled = errors.New("That post isn't scheduled any more.")
	ErrNotLive      = errors.New("That post isn't live.")
	ErrNoTitle      = errors.New("Give the post a title before it goes out.")
	ErrNoSlug       = errors.New("Give the post an address before it goes out.")
	ErrPast         = errors.New("Pick a time in the future.")
)

// Service holds the changelog's reads and its publish lifecycle. It has no HTTP types, so the
// API, the cron and later the MCP tools all call it directly.
type Service struct {
	App core.App
	Now func() time.Time
	// BaseURL is LORT_URL, for the absolute addresses in link previews.
	BaseURL string
	// AppName is the board's name, for link previews.
	AppName func() string

	// Test seams: between runs after PublishDue picks the due posts and before each one's
	// transaction; failSave can fail a scheduled publish before it saves.
	between  func(id string)
	failSave func(id string) error
}

func New(app core.App) *Service {
	return &Service{App: app, Now: time.Now, AppName: func() string { return "" }}
}

// Page is one page of a list.
type Page[T any] struct {
	Items      []T `json:"items"`
	Page       int `json:"page"`
	PerPage    int `json:"perPage"`
	TotalItems int `json:"totalItems"`
}

const perPage = 20

// PostSummary is a post as the public list shows it. File names are relative to
// /api/files/changelogs/<id>/.
type PostSummary struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Excerpt     string    `json:"excerpt"`
	Labels      []string  `json:"labels"`
	PublishedAt time.Time `json:"publishedAt"`
}

// Post is a published post's page.
type Post struct {
	PostSummary
	Body    string          `json:"body"`
	Cover   string          `json:"cover"`
	Shipped []requests.Item `json:"shipped"`
}

// TeamPost is a post as the dashboard list shows it. Revision is the edit precondition the
// editor sends with its next save.
type TeamPost struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	Slug         string          `json:"slug"`
	State        string          `json:"state"`
	Labels       []string        `json:"labels"`
	PublishAt    *time.Time      `json:"publishAt"`
	PublishedAt  *time.Time      `json:"publishedAt"`
	Updated      *time.Time      `json:"updated"`
	Requests     int             `json:"requests"`
	Author       requests.Person `json:"author"`
	PublishError string          `json:"publishError"`
	Revision     int             `json:"revision"`
}

// EditorPost is everything the editor needs, with the attached requests in the team view.
type EditorPost struct {
	TeamPost
	Body             string          `json:"body"`
	Cover            string          `json:"cover"`
	Excerpt          string          `json:"excerpt"`
	Images           []string        `json:"images"`
	SlugCustom       bool            `json:"slugCustom"`
	CompleteAttached bool            `json:"completeAttached"`
	Attached         []requests.Item `json:"attached"`
}

// PublishResult is a publish, with how many attached requests it marked as completed.
type PublishResult struct {
	Post      TeamPost `json:"post"`
	Completed int      `json:"completed"`
}

// FailedPost is a scheduled post that didn't go out.
type FailedPost struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	PublishAt time.Time `json:"publishAt"`
	Error     string    `json:"error"`
}

func find(app core.App, id string) (*core.Record, error) {
	r, err := app.FindRecordById(schema.Changelogs, id)
	if err != nil {
		return nil, ErrNotFound
	}
	return r, nil
}

func timePtr(r *core.Record, field string) *time.Time {
	dt := r.GetDateTime(field)
	if dt.IsZero() {
		return nil
	}
	t := dt.Time()
	return &t
}

func summary(r *core.Record) PostSummary {
	return PostSummary{
		ID: r.Id, Slug: r.GetString("slug"), Title: r.GetString("title"), Excerpt: r.GetString("excerpt"),
		Labels: labels(r), PublishedAt: r.GetDateTime("publishedAt").Time(),
	}
}

// labels lists a post's labels in display order: New, Improved, Fixed.
func labels(r *core.Record) []string {
	has := map[string]bool{}
	for _, l := range r.GetStringSlice("labels") {
		has[l] = true
	}
	out := []string{}
	for _, l := range []string{"new", "improved", "fixed"} {
		if has[l] {
			out = append(out, l)
		}
	}
	return out
}

func teamPost(app core.App, r *core.Record) TeamPost {
	p := TeamPost{
		ID: r.Id, Title: r.GetString("title"), Slug: r.GetString("slug"), State: r.GetString("state"),
		Labels: labels(r), PublishAt: timePtr(r, "publishAt"), PublishedAt: timePtr(r, "publishedAt"),
		Updated: timePtr(r, "updated"), Requests: len(r.GetStringSlice("requests")),
		PublishError: r.GetString("publishError"), Revision: r.GetInt("revision"),
	}
	if id := r.GetString("author"); id != "" {
		if a, err := app.FindRecordById(schema.Users, id); err == nil {
			p.Author = requests.Person{ID: a.Id, Name: a.GetString("name"), Avatar: a.GetString("avatar"), Team: a.GetBool("isAdmin")}
		}
	}
	return p
}
