package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/pocketbase/pocketbase"
	"github.com/spf13/cobra"

	"github.com/hacker4ofakind/lort/server/internal/setup"
)

func init() {
	early["setup"] = setupCmd
	early["run-line"] = runLineCmd
}

// sentence prints an error the way the wizard talks: capitalised, with a full stop.
func sentence(err error) string {
	s := err.Error()
	if s == "" {
		return s
	}
	s = strings.ToUpper(s[:1]) + s[1:]
	if !strings.HasSuffix(s, ".") && !strings.HasSuffix(s, "!") {
		s += "."
	}
	return s
}

// interruptible makes Ctrl-C stop the program cleanly, echo restored. The wizard runs as the
// container's PID 1, where SIGINT does nothing without a handler.
func interruptible(t *setup.Terminal) {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-ch
		t.Restore()
		fmt.Fprintln(os.Stderr, "\nStopped. Anything setup said it saved is saved; nothing else changed.")
		os.Exit(130)
	}()
}

// setupCmd is `lort setup`, which the wrapper scripts run in a throwaway container.
func setupCmd(args []string) int {
	fs := flag.NewFlagSet("setup", flag.ContinueOnError)
	workdir := fs.String("workdir", ".", "the folder that holds .env")
	dataDir := fs.String("data", envOr("LORT_DATA", "/data/pb_data"), "PocketBase's data folder")
	portsFree := fs.String("ports-free", "yes", "whether ports 80 and 443 are free: yes or no")
	running := fs.String("container-running", "no", "whether a container named lort is running: yes or no")
	osName := fs.String("os", "linux", "linux, mac or windows")
	script := fs.String("script", "", "the setup script to name in advice (default: from --os)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	t := setup.NewTerminal(os.Stdin, os.Stdout)
	interruptible(t)
	o := setup.Options{Workdir: *workdir, DataDir: *dataDir, PortsFree: *portsFree == "yes", ContainerRunning: *running == "yes", OS: *osName, Script: *script}
	if err := setup.Run(context.Background(), setup.NewHost(t, *dataDir), o); err != nil {
		fmt.Fprintf(os.Stderr, "\n%s\n", sentence(err))
		return 1
	}
	return 0
}

func runLineCmd(args []string) int {
	if len(args) != 1 || (args[0] != string(setup.ModeHTTPS) && args[0] != string(setup.ModeProxy)) {
		fmt.Fprintln(os.Stderr, "usage: lort run-line https|proxy")
		return 2
	}
	fmt.Println(setup.RunLine(setup.Mode(args[0])))
	return 0
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// addCommands registers Lort's PocketBase subcommands: they need the database open.
func addCommands(app *pocketbase.PocketBase) {
	var check bool
	setupAdmin := &cobra.Command{
		Use:    "setup-admin",
		Short:  "Used by lort setup to create the first admin",
		Hidden: true,
		Run: func(*cobra.Command, []string) {
			os.Exit(setup.SetupAdmin(app, check, os.Stdin))
		},
	}
	setupAdmin.Flags().BoolVar(&check, "check", false, "exit 0 if an admin exists, 1 if none does")

	resetAdmin := &cobra.Command{
		Use:   "reset-admin",
		Short: "Set a new password for an admin (asks for it on the terminal)",
		Run: func(*cobra.Command, []string) {
			t := setup.NewTerminal(os.Stdin, os.Stdout)
			interruptible(t)
			if err := setup.ResetAdmin(context.Background(), setup.Host{Prompt: t, Admin: setup.AppAdmin{App: app}}); err != nil {
				fmt.Fprintf(os.Stderr, "\n%s\n", sentence(err))
				os.Exit(1)
			}
		},
	}
	app.RootCmd.AddCommand(setupAdmin, resetAdmin)
}
