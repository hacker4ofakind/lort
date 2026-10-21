package setup

import (
	"fmt"
	"strings"
)

// Mode is how Lort meets the internet.
type Mode string

const (
	ModeHTTPS Mode = "https" // Lort holds 80 and 443 and gets its own certificate
	ModeProxy Mode = "proxy" // the owner's proxy forwards to 127.0.0.1:4052
)

const runFlags = "docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3"

// RunLine is the one definition of the command that starts Lort (spec 1.2, step 9).
// `lort run-line <mode>` prints it for the scripts and tests.
func RunLine(m Mode) string {
	ports := "-p 80:80 -p 443:443"
	if m == ModeProxy {
		ports = "-p 127.0.0.1:4052:4052"
	}
	return runFlags + " " + ports + " -v lort_data:/data --env-file .env lort"
}

// nginxBlock is a server block for the owner's nginx. The visitor's address goes last in
// X-Forwarded-For, which is the entry Lort reads.
func nginxBlock(host string) string {
	return strings.ReplaceAll(`server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name HOST;
    # Your certificate here (certbot --nginx adds these two lines for you):
    # ssl_certificate     /etc/letsencrypt/live/HOST/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/HOST/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:4052;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        # Live updates are server-sent events: don't buffer them, and let them stay open.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}`, "HOST", host)
}

// caddyBlock is the same for Caddy, which gets the certificate and sets X-Forwarded-For
// itself.
func caddyBlock(host string) string {
	return strings.ReplaceAll(`HOST {
    header Strict-Transport-Security "max-age=31536000"
    reverse_proxy 127.0.0.1:4052
}`, "HOST", host)
}

func agentPrompt(host string) string {
	return fmt.Sprintf("Add a reverse proxy from %s to 127.0.0.1:4052 with HTTPS (a Let's Encrypt certificate) and HSTS. "+
		"Allow uploads up to 16 MB, don't buffer responses (the board streams live updates as server-sent events), "+
		"and append the visitor's address to X-Forwarded-For.", host)
}

func finish(p Prompter, o Options, addr address, mode Mode) {
	if mode == ModeProxy && !addr.local {
		p.Say("Ports 80 and 443 are taken, so Lort will listen on 127.0.0.1:4052 and your web server can pass visitors along.")
		p.Say("")
		p.Say("For nginx:")
		p.Say("%s", nginxBlock(addr.host))
		p.Say("")
		p.Say("Or for Caddy:")
		p.Say("%s", caddyBlock(addr.host))
		p.Say("")
		p.Say("Or ask your coding agent:")
		p.Say("  %s", agentPrompt(addr.host))
		p.Say("")
	}
	if mode == ModeHTTPS {
		p.Say("Ports 80 and 443 are free, so Lort will get its own HTTPS certificate from Let's Encrypt.")
		p.Say("")
	}
	// The name lort stays taken until the old container is removed, running or not.
	switch {
	case o.ContainerRunning:
		p.Say("Lort is already running. To start it with these settings, stop and remove it first (your data stays in the lort_data volume):")
		p.Say("  docker stop lort && docker rm lort")
		p.Say("")
	case o.ContainerExists:
		p.Say("There's a stopped Lort container in the way. Remove it first (your data stays in the lort_data volume):")
		p.Say("  docker rm lort")
		p.Say("")
	}
	p.Say("All set! Start your board with:")
	p.Say("")
	p.Say("  %s", RunLine(mode))
	p.Say("")
	p.Say("Then open %s.", addr.url())
	p.Say("Keep a copy of .env somewhere safe: its LORT_ENCRYPTION_KEY is the only key to your board's settings.")
}
