package main

import (
	"io"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// tlsLog is the HTTP server's error log. PocketBase only writes these lines to its logs table
// at debug level, so a closed firewall or a DNS record that hasn't propagated would fail
// silently. tlsLog copies certificate trouble to stderr (docker logs), once per ten minutes
// per message, and leaves out the noise from scanners poking the server.
type tlsLog struct {
	app  core.App
	host string
	out  io.Writer

	mu   sync.Mutex
	seen map[string]time.Time
}

func newTLSLog(app core.App, host string, out io.Writer) *tlsLog {
	return &tlsLog{app: app, host: host, out: out, seen: map[string]time.Time{}}
}

var (
	peer         = regexp.MustCompile(`from \S+: `)
	scannerNoise = []string{"missing server name", "not configured in HostWhitelist"}
)

func (l *tlsLog) Write(p []byte) (int, error) {
	line := strings.TrimSpace(string(p))
	if l.app != nil {
		l.app.Logger().Debug(line)
	}
	if !l.relevant(line) {
		return len(p), nil
	}
	key := peer.ReplaceAllString(line, "from *: ")
	l.mu.Lock()
	defer l.mu.Unlock()
	if at, ok := l.seen[key]; ok && time.Since(at) < 10*time.Minute {
		return len(p), nil
	}
	if len(l.seen) > 1000 {
		clear(l.seen)
	}
	l.seen[key] = time.Now()
	_, _ = io.WriteString(l.out, "HTTPS certificate: "+line+"\n")
	return len(p), nil
}

func (l *tlsLog) relevant(line string) bool {
	for _, n := range scannerNoise {
		if strings.Contains(line, n) {
			return false
		}
	}
	return strings.Contains(line, "acme") || strings.Contains(line, "autocert") ||
		(l.host != "" && strings.Contains(line, l.host))
}
