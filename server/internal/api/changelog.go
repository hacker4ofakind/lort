package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
)

// registerChangelog adds the changelog's public reads to g and the team's routes to team.
func registerChangelog(g, team *router.RouterGroup[*core.RequestEvent], d Deps) {
	g.GET("/changelog", d.changelogList)
	g.GET("/changelog/{slug}", d.changelogPost)

	team.GET("/changelogs", d.changelogTeamList)
	team.POST("/changelogs", d.changelogCreate)
	team.GET("/changelogs/failed", d.changelogFailed)
	team.GET("/changelogs/{id}", d.changelogEditor)
	team.POST("/changelogs/{id}/publish", d.changelogPublish)
	team.POST("/changelogs/{id}/schedule", d.changelogSchedule)
	team.POST("/changelogs/{id}/unschedule", d.changelogUnschedule)
	team.POST("/changelogs/{id}/unpublish", d.changelogUnpublish)
}

func (d Deps) changelogList(e *core.RequestEvent) error {
	q := e.Request.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	res, err := d.Changelog.List(q.Get("label"), page)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, res)
}

func (d Deps) changelogPost(e *core.RequestEvent) error {
	// Superusers get no exception: the editor has its own read, and a team member's
	// voted stickers come from their board profile like anyone's.
	var who *core.Record
	if e.Auth != nil && e.Auth.Collection().Name == "users" {
		who = e.Auth
	}
	p, err := d.Changelog.BySlug(e.Request.PathValue("slug"), who)
	if err != nil {
		return fail(e, err)
	}
	noStore(e) // the shipped stickers show the caller's votes
	return e.JSON(http.StatusOK, p)
}

func (d Deps) changelogTeamList(e *core.RequestEvent) error {
	q := e.Request.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	res, err := d.Changelog.TeamList(changelog.TeamQuery{
		States: csv(q.Get("state")), Labels: csv(q.Get("label")), Q: q.Get("q"), Page: page,
	})
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, res)
}

func (d Deps) changelogCreate(e *core.RequestEvent) error {
	who, err := actor(e)
	if err != nil {
		return err
	}
	id, err := d.Changelog.Create(who)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]string{"id": id})
}

func (d Deps) changelogFailed(e *core.RequestEvent) error {
	items, err := d.Changelog.Failed()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (d Deps) changelogEditor(e *core.RequestEvent) error {
	p, err := d.Changelog.Editor(e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, p)
}

func (d Deps) changelogPublish(e *core.RequestEvent) error {
	who, err := actor(e)
	if err != nil {
		return err
	}
	res, err := d.Changelog.Publish(e.Request.PathValue("id"), who)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, res)
}

func (d Deps) changelogSchedule(e *core.RequestEvent) error {
	var body struct {
		PublishAt string `json:"publishAt"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Pick a day and time.", err)
	}
	at, err := time.Parse(time.RFC3339, body.PublishAt)
	if err != nil {
		return e.BadRequestError("Pick a day and time.", nil)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	p, err := d.Changelog.Schedule(e.Request.PathValue("id"), at, who)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, p)
}

func (d Deps) changelogUnschedule(e *core.RequestEvent) error {
	p, err := d.Changelog.Unschedule(e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, p)
}

func (d Deps) changelogUnpublish(e *core.RequestEvent) error {
	p, err := d.Changelog.Unpublish(e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, p)
}
