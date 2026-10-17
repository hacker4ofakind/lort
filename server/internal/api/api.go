// Package api serves Lort's own endpoints under /api/lort.
package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/catalog"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/site"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/team"
)

type Deps struct {
	Svc  *requests.Service
	Cfg  config.Config
	Site *site.Cache
}

// Register adds every /api/lort route.
func Register(se *core.ServeEvent, d Deps) {
	g := se.Router.Group("/api/lort")
	g.GET("/health", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	})
	g.GET("/config", d.config)
	g.GET("/requests", d.list)
	g.GET("/requests/{id}", d.detail)
	g.GET("/similar", d.similar)
	g.POST("/requests/{id}/vote", d.vote).Bind(apis.RequireAuth("users"))

	team := g.Group("").Bind(apis.RequireSuperuserAuth())
	team.POST("/requests/{id}/status", d.setStatus)
	team.POST("/requests/{id}/undo", d.undo)
	team.POST("/requests/{id}/merge", d.merge)
	team.POST("/requests/{id}/seen", d.seen)
	team.POST("/requests/{id}/board", d.moveBoard)
	team.POST("/requests/{id}/author", d.reassign)
	team.GET("/queue", d.queue)
	team.GET("/stats", d.stats)
	team.POST("/order/{collection}", d.order)
	team.DELETE("/boards/{id}", d.deleteBoard)
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
		errors.Is(err, requests.ErrBadMerge), errors.Is(err, team.ErrRemoveSelf), errors.Is(err, team.ErrLastAdmin):
		return e.BadRequestError(err.Error(), nil)
	default:
		return e.BadRequestError(err.Error(), nil)
	}
}

// actor is the signed-in superuser's users profile, used for timeline entries and comments.
func actor(e *core.RequestEvent) (*core.Record, error) {
	return team.Profile(e.App, e.Auth)
}

func (d Deps) config(e *core.RequestEvent) error {
	c, err := d.Site.Get()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, c)
}

func csv(v string) []string {
	if v == "" {
		return nil
	}
	return strings.Split(v, ",")
}

// query reads the list filters shared by /requests and /queue.
func query(e *core.RequestEvent) requests.Query {
	q := e.Request.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("perPage"))
	return requests.Query{
		Sort: q.Get("sort"), Statuses: csv(q.Get("status")), Boards: csv(q.Get("board")),
		Tags: csv(q.Get("tag")), Visibility: q.Get("visibility"), Search: q.Get("q"),
		Page: page, PerPage: perPage,
	}
}

func (d Deps) list(e *core.RequestEvent) error {
	var viewer *core.Record
	if e.Auth != nil && e.Auth.Collection().Name == "users" {
		viewer = e.Auth
	}
	res, err := d.Svc.List(query(e), viewer, e.HasSuperuserAuth())
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, res)
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

// viewer is who is looking at a request page: a board user, or a superuser's team profile
// (team = true, the dashboard's view).
func viewer(e *core.RequestEvent) (*core.Record, bool, error) {
	switch {
	case e.Auth == nil:
		return nil, false, nil
	case e.HasSuperuserAuth():
		p, err := actor(e)
		return p, true, err
	case e.Auth.Collection().Name == "users":
		return e.Auth, false, nil
	}
	return nil, false, nil
}

func (d Deps) detail(e *core.RequestEvent) error {
	who, team, err := viewer(e)
	if err != nil {
		return err
	}
	det, err := d.Svc.Detail(e.Request.PathValue("id"), who, team)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, det)
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

func (d Deps) reassign(e *core.RequestEvent) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Enter an email address.", err)
	}
	u, err := team.UserByEmail(e.App, body.Email)
	if err != nil {
		return fail(e, err)
	}
	if err := d.Svc.Reassign(e.Request.PathValue("id"), u); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) queue(e *core.RequestEvent) error {
	info, err := d.Svc.Queue(query(e), e.Request.URL.Query().Get("current"))
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, info)
}

func (d Deps) stats(e *core.RequestEvent) error {
	st, err := d.Svc.Stats()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, st)
}

func (d Deps) order(e *core.RequestEvent) error {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Send the ids in their new order.", err)
	}
	if err := catalog.SetOrder(e.App, e.Request.PathValue("collection"), body.IDs); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) deleteBoard(e *core.RequestEvent) error {
	who, err := actor(e)
	if err != nil {
		return err
	}
	if err := d.Svc.DeleteBoard(e.Request.PathValue("id"), e.Request.URL.Query().Get("moveTo"), who); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}
