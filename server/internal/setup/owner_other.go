//go:build !unix

package setup

import "os/exec"

// The wizard runs in a Linux container; on other systems (tests, development) files keep
// whatever owner they get.

func chownLike(string, string) error { return nil }

func ownData(string) error { return nil }

func asLort(*exec.Cmd) {}
