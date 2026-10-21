package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
)

type verdict int

const (
	verdictOK       verdict = iota
	verdictMissing          // no A or AAAA records
	verdictMismatch         // records, none of them this server
	verdictPartly           // some records point here, some don't
	verdictUnknown          // the resolver or ipify couldn't be reached
)

func (v verdict) String() string {
	return [...]string{"ok", "missing", "mismatch", "partly", "couldn't check"}[v]
}

// lookup is one round of the DNS check.
type lookup struct {
	a, aaaa        []netip.Addr
	aErr, aaaaErr  error
	ip4, ip6       netip.Addr
	ip4Err, ip6Err error
}

// v6Unchecked: AAAA records exist but this machine (often Docker's bridge) has no IPv6 to
// compare them with. That's a note, not a failure.
func (l lookup) v6Unchecked() bool { return len(l.aaaa) > 0 && l.ip6Err != nil }

func (l lookup) verdict() verdict {
	if l.aErr != nil || l.aaaaErr != nil || (l.ip4Err != nil && l.ip6Err != nil) {
		return verdictUnknown
	}
	if len(l.a) == 0 && len(l.aaaa) == 0 {
		return verdictMissing
	}
	var checked, match int
	count := func(records []netip.Addr, mine netip.Addr, err error) {
		if err != nil {
			return
		}
		for _, r := range records {
			checked++
			if r == mine {
				match++
			}
		}
	}
	count(l.a, l.ip4, l.ip4Err)
	count(l.aaaa, l.ip6, l.ip6Err)
	switch {
	case checked == 0:
		return verdictUnknown
	case match == checked:
		return verdictOK
	case match == 0:
		return verdictMismatch
	}
	return verdictPartly
}

// lookUp runs the four questions in parallel, 5 seconds each.
func lookUp(ctx context.Context, n Net, host string) lookup {
	var l lookup
	var wg sync.WaitGroup
	run := func(f func(ctx context.Context)) {
		wg.Go(func() {
			ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			f(ctx)
		})
	}
	run(func(ctx context.Context) { l.a, l.aErr = n.DNS(ctx, host, "A") })
	run(func(ctx context.Context) { l.aaaa, l.aaaaErr = n.DNS(ctx, host, "AAAA") })
	run(func(ctx context.Context) { l.ip4, l.ip4Err = n.PublicIP(ctx, 4) })
	run(func(ctx context.Context) { l.ip6, l.ip6Err = n.PublicIP(ctx, 6) })
	wg.Wait()
	return l
}

func list(addrs []netip.Addr) string {
	s := make([]string, len(addrs))
	for i, a := range addrs {
		s[i] = a.String()
	}
	return strings.Join(s, ", ")
}

func (l lookup) here() string {
	var s []string
	if l.ip4Err == nil {
		s = append(s, l.ip4.String())
	}
	if l.ip6Err == nil {
		s = append(s, l.ip6.String())
	}
	return strings.Join(s, " and ")
}

// checkDNS checks that host points at this server, offering to check again until it does or
// the owner carries on anyway.
func checkDNS(ctx context.Context, h Host, host string) error {
	p := h.Prompt
	p.Say("Checking that %s points at this server.", host)
	p.Say("(To check, setup asks Google's DNS, dns.google, about %s and asks ipify, api.ipify.org, for this server's address.)", host)
	for {
		l := lookUp(ctx, h.Net, host)
		v := l.verdict()
		switch v {
		case verdictOK:
			p.Say("%s points here. Nice.", host)
		case verdictMissing:
			p.Say("%s has no address yet. At your DNS provider, add an A record for %s with the value %s.", host, host, l.here())
			p.Say("New records can take a few minutes to show up.")
		case verdictMismatch, verdictPartly:
			records := slices.Concat(l.a, l.aaaa)
			if v == verdictMismatch {
				p.Say("%s points to %s, but this server is %s.", host, list(records), l.here())
				p.Say("Change its A record to %s at your DNS provider.", l.here())
			} else {
				p.Say("Some of %s's records point here and some don't (%s; this server is %s).", host, list(records), l.here())
				p.Say("Remove the records that aren't this server.")
			}
			p.Say("Old AAAA (IPv6) records break Let's Encrypt, so remove any that aren't this server.")
			p.Say("Using Cloudflare's orange-cloud proxy? Then the address will differ, and that's expected. HTTPS mode needs it off (grey cloud) so Lort can get its certificate.")
		case verdictUnknown:
			p.Say("Couldn't check the DNS from here (%s). That doesn't mean the record is wrong.", l.firstErr())
		}
		if l.v6Unchecked() {
			p.Say("Note: IPv6 not checked from here, because this container has no IPv6. Make sure any AAAA record is this server.")
		}
		if v == verdictOK {
			return nil
		}
		again, err := p.Confirm("Check again?", v != verdictUnknown)
		if err != nil {
			return ended(err)
		}
		if !again {
			p.Say("Carrying on. You can fix the record later; HTTPS starts working once it points here.")
			return nil
		}
	}
}

func (l lookup) firstErr() error {
	for _, err := range []error{l.aErr, l.aaaaErr, l.ip4Err, l.ip6Err} {
		if err != nil {
			return err
		}
	}
	return nil
}

// webNet is the real Net: Google's DNS-over-HTTPS and ipify.
type webNet struct{ client *http.Client }

func newWebNet() webNet { return webNet{client: &http.Client{Timeout: 5 * time.Second}} }

func (n webNet) get(ctx context.Context, u string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/dns-json")
	res, err := n.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %s", req.URL.Host, res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, 1<<16))
}

func (n webNet) DNS(ctx context.Context, host, typ string) ([]netip.Addr, error) {
	body, err := n.get(ctx, "https://dns.google/resolve?name="+url.QueryEscape(host)+"&type="+typ)
	if err != nil {
		return nil, err
	}
	var r struct {
		Status int
		Answer []struct {
			Type int    `json:"type"`
			Data string `json:"data"`
		}
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, err
	}
	if r.Status != 0 && r.Status != 3 { // NOERROR, NXDOMAIN
		return nil, fmt.Errorf("dns.google answered status %d", r.Status)
	}
	want := map[string]int{"A": 1, "AAAA": 28}[typ]
	var out []netip.Addr
	for _, a := range r.Answer {
		if a.Type != want {
			continue // CNAMEs on the way
		}
		if ip, err := netip.ParseAddr(a.Data); err == nil {
			out = append(out, ip)
		}
	}
	return out, nil
}

func (n webNet) PublicIP(ctx context.Context, version int) (netip.Addr, error) {
	u := "https://api.ipify.org"
	if version == 6 {
		u = "https://api6.ipify.org"
	}
	body, err := n.get(ctx, u)
	if err != nil {
		return netip.Addr{}, err
	}
	return netip.ParseAddr(strings.TrimSpace(string(body)))
}
