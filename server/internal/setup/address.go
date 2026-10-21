package setup

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/envfile"
)

// address is the board's public address.
type address struct {
	host  string // feedback.yoursite.com, or localhost
	local bool   // a try-out on this machine: no DNS, plain HTTP on :4052
}

func (a address) url() string {
	if a.local {
		return "http://localhost:4052"
	}
	return "https://" + a.host
}

// normalizeHost turns whatever the owner typed into a bare host name.
func normalizeHost(in string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(in))
	if s == "" {
		return "", errors.New("Type the address people will visit, like feedback.yoursite.com.")
	}
	if strings.ContainsAny(s, " \t") {
		return "", fmt.Errorf("%q has a space in it. Type just the address, like feedback.yoursite.com.", in)
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Hostname() == "" {
		return "", fmt.Errorf("%q doesn't look like an address. Try something like feedback.yoursite.com.", in)
	}
	host := strings.TrimSuffix(u.Hostname(), ".")
	if host == "localhost" {
		return host, nil
	}
	if u.Port() != "" {
		return "", fmt.Errorf("Leave the port off (%q). Lort answers on the usual HTTPS port, or behind your proxy.", in)
	}
	// The same check the server runs at every boot.
	cfg := config.Config{URL: "https://" + host, TLS: "auto", EncryptionKey: strings.Repeat("k", config.KeyLength)}
	if err := cfg.Check(); err != nil {
		var se *config.SettingError
		if errors.As(err, &se) {
			return "", fmt.Errorf("%s", strings.Replace(se.Problem, "LORT_URL", "That address", 1))
		}
		return "", err
	}
	return host, nil
}

func savedHost(saved envfile.File) string {
	v, _ := saved.Get("LORT_URL")
	if u, err := url.Parse(v); err == nil && u.Hostname() != "" {
		return u.Hostname()
	}
	return ""
}

// askAddress asks for the board's address and, for a real domain, checks its DNS.
func askAddress(ctx context.Context, h Host, saved envfile.File) (address, error) {
	p := h.Prompt
	p.Say("Where will people find your board? Use a subdomain you own, like feedback.yoursite.com.")
	p.Say("Just trying it out on this computer? Type localhost.")
	def := savedHost(saved)
	for {
		in, err := p.Ask("Board address", def)
		if err != nil {
			return address{}, ended(err)
		}
		host, err := normalizeHost(in)
		if err != nil {
			p.Say("%v", err)
			continue
		}
		a := address{host: host, local: host == "localhost"}
		if a.local {
			p.Say("A try-out it is. Your board will be at http://localhost:4052.")
			p.Say("")
			return a, nil
		}
		if err := checkDNS(ctx, h, host); err != nil {
			return address{}, err
		}
		p.Say("")
		return a, nil
	}
}
