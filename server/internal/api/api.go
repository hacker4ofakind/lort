// Package api serves Lort's own endpoints under /api/lort.
package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/team"
)

type Deps struct {
	Svc *requests.Service
	Cfg config.Config
}

// Register adds every /api/lort route.
func Register(se *core.ServeEvent, d Deps) {
	g := se.Router.Group("/api/lort")
	g.GET("/health", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	})
	g.GET("/config", d.config)
	g.GET("/requests", d.list)
	g.GET("/requests/{id}", d.get)
	g.GET("/similar", d.similar)
	g.POST("/requests/{id}/vote", d.vote).Bind(apis.RequireAuth("users"))

	team := g.Group("").Bind(apis.RequireSuperuserAuth())
	team.POST("/requests/{id}/status", d.setStatus)
	team.POST("/requests/{id}/undo", d.undo)
	team.POST("/requests/{id}/merge", d.merge)
	team.POST("/requests/{id}/seen", d.seen)
	team.POST("/requests/{id}/board", d.moveBoard)
	team.GET("/stats", d.stats)
	team.GET("/team", d.teamList)
	team.GET("/team/me", d.teamMe)
	team.POST("/team/invite", d.teamInvite)
	team.DELETE("/team/{id}", d.teamRemove)
	team.GET("/users/{id}", d.userSummary)
	team.POST("/users/{id}/ban", d.userBan)
	team.POST("/users/{id}/reset-link", d.userResetLink)
}

// fail maps service errors to friendly HTTP errors.
func fail(e *core.RequestEvent, err error) error {
	switch {
	case errors.Is(err, requests.ErrNotFound):
		return e.NotFoundError("That request is gone.", nil)
	case errors.Is(err, requests.ErrNotVoting), errors.Is(err, requests.ErrUndoGone),
		errors.Is(err, requests.ErrBadMerge), errors.Is(err, requests.ErrNoBoard), errors.Is(err, team.ErrRemoveSelf), errors.Is(err, team.ErrLastAdmin):
		return e.BadRequestError(err.Error(), nil)
	default:
		return e.BadRequestError(err.Error(), nil)
	}
}

// actor is the signed-in superuser's users profile, used for timeline entries and comments.
func actor(e *core.RequestEvent) (*core.Record, error) {
	return team.Profile(e.App, e.Auth)
}

// Brand is what every page needs before it renders: the owner's branding and which
// optional features are on. The proxy also hands it to Next.js in the X-Lort-Config header.
type Brand struct {
	AppName         string          `json:"appName"`
	Logo            string          `json:"logo"`
	PrimaryColor    string          `json:"primaryColor"`
	ShowLandingCard bool            `json:"showLandingCard"`
	RoadmapPublic   bool            `json:"roadmapPublic"`
	Features        map[string]bool `json:"features"`
}

func LoadBrand(app core.App) (Brand, error) {
	settings, err := app.FindFirstRecordByFilter("settings", "")
	if err != nil {
		return Brand{}, err
	}
	logo := ""
	if f := settings.GetString("logo"); f != "" {
		logo = "/api/files/settings/" + settings.Id + "/" + f
	}
	return Brand{
		AppName:         settings.GetString("appName"),
		Logo:            logo,
		PrimaryColor:    settings.GetString("primaryColor"),
		ShowLandingCard: settings.GetBool("showLandingCard"),
		RoadmapPublic:   settings.GetBool("roadmapPublic"),
		Features:        map[string]bool{"email": false, "voice": false, "turnstile": false},
	}, nil
}

// BrandHeader is the brand as base64 JSON for the X-Lort-Config header, or "" if it can't be read.
func BrandHeader(app core.App) string {
	b, err := LoadBrand(app)
	if err != nil {
		return ""
	}
	raw, err := json.Marshal(b)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func (d Deps) config(e *core.RequestEvent) error {
	brand, err := LoadBrand(e.App)
	if err != nil {
		return err
	}
	boards, err := e.App.FindRecordsByFilter("boards", "isPublic = true", "order", 0, 0)
	if err != nil {
		return err
	}
	tags, err := e.App.FindRecordsByFilter("tags", "", "order", 0, 0)
	if err != nil {
		return err
	}
	type ref struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	toRefs := func(rs []*core.Record) []ref {
		out := make([]ref, len(rs))
		for i, r := range rs {
			out[i] = ref{r.Id, r.GetString("name")}
		}
		return out
	}
	return e.JSON(http.StatusOK, struct {
		Brand
		Boards []ref `json:"boards"`
		Tags   []ref `json:"tags"`
	}{brand, toRefs(boards), toRefs(tags)})
}

func csv(v string) []string {
	if v == "" {
		return nil
	}
	return strings.Split(v, ",")
}

// viewer is the signed-in board user, or nil for visitors and superusers.
func viewer(e *core.RequestEvent) *core.Record {
	if e.Auth != nil && e.Auth.Collection().Name == "users" {
		return e.Auth
	}
	return nil
}

func (d Deps) list(e *core.RequestEvent) error {
	q := e.Request.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("perPage"))
	viewer := viewer(e)
	res, err := d.Svc.List(requests.Query{
		Sort: q.Get("sort"), Statuses: csv(q.Get("status")), Boards: csv(q.Get("board")),
		Tags: csv(q.Get("tag")), Visibility: q.Get("visibility"), Search: q.Get("q"),
		Page: page, PerPage: perPage,
	}, viewer, e.HasSuperuserAuth())
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, res)
}

func (d Deps) get(e *core.RequestEvent) error {
	page, err := d.Svc.Get(e.Request.PathValue("id"), viewer(e), e.HasSuperuserAuth())
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, page)
}

func (d Deps) moveBoard(e *core.RequestEvent) error {
	var body struct {
		Board string `json:"board"`
	}
	if err := e.BindBody(&body); err != nil || body.Board == "" {
		return e.BadRequestError("Pick a board.", err)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	if err := d.Svc.MoveBoard(e.Request.PathValue("id"), body.Board, who); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) stats(e *core.RequestEvent) error {
	st, err := d.Svc.Stats()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, st)
}

func (d Deps) similar(e *core.RequestEvent) error {
	items, err := d.Svc.Similar(e.Request.URL.Query().Get("q"), 3)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (d Deps) vote(e *core.RequestEvent) error {
	if e.Auth.GetBool("banned") {
		return e.ForbiddenError("Your account can't vote on this board.", nil)
	}
	voted, count, err := d.Svc.ToggleVote(e.Request.PathValue("id"), e.Auth.Id)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"voted": voted, "votes": count})
}

func (d Deps) setStatus(e *core.RequestEvent) error {
	var body struct {
		Action status.Action `json:"action"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Send an action.", err)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	ch, err := d.Svc.SetStatus(e.Request.PathValue("id"), body.Action, who)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, ch)
}

func (d Deps) undo(e *core.RequestEvent) error {
	ch, err := d.Svc.UndoComplete(e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, ch)
}

func (d Deps) merge(e *core.RequestEvent) error {
	var body struct {
		Target string `json:"target"`
	}
	if err := e.BindBody(&body); err != nil || body.Target == "" {
		return e.BadRequestError("Pick a request to merge into.", err)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	if err := d.Svc.Merge(e.Request.PathValue("id"), body.Target, who); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) seen(e *core.RequestEvent) error {
	if err := d.Svc.MarkSeen(e.Request.PathValue("id")); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) teamList(e *core.RequestEvent) error {
	members, err := team.List(e.App)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": members, "you": e.Auth.Id})
}

// teamMe returns the admin's public profile and a token for it, so the dashboard can
// comment, vote and suggest as that profile on the public board.
func (d Deps) teamMe(e *core.RequestEvent) error {
	p, err := actor(e)
	if err != nil {
		return err
	}
	token, err := p.NewAuthToken()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"profile": p, "token": token})
}

func (d Deps) teamInvite(e *core.RequestEvent) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := e.BindBody(&body); err != nil || !strings.Contains(body.Email, "@") {
		return e.BadRequestError("Enter an email address.", err)
	}
	link, err := team.Invite(e.App, d.Cfg.URL, strings.TrimSpace(body.Email))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"link": link})
}

func (d Deps) teamRemove(e *core.RequestEvent) error {
	if err := team.Remove(e.App, e.Auth, e.Request.PathValue("id")); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) userSummary(e *core.RequestEvent) error {
	s, err := team.UserSummary(e.App, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("That person is gone.", nil)
	}
	return e.JSON(http.StatusOK, s)
}

func (d Deps) userBan(e *core.RequestEvent) error {
	var body struct {
		Banned bool `json:"banned"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Send banned: true or false.", err)
	}
	if err := team.SetBanned(e.App, e.Request.PathValue("id"), body.Banned); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) userResetLink(e *core.RequestEvent) error {
	link, err := team.ResetLink(e.App, d.Cfg.URL, e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"link": link})
}
