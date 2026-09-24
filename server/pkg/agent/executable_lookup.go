package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

var currentGOOS = runtime.GOOS

var darwinExtraBinDirs = []string{
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/opt/local/bin",
}

func lookPathWithFallback(bin string) (string, error) {
	bin = strings.TrimSpace(bin)
	if bin == "" {
		return "", fmt.Errorf("executable name is empty")
	}
	p, err := exec.LookPath(bin)
	if err == nil {
		return p, nil
	}
	lookErr := err
	if currentGOOS != "darwin" || strings.ContainsRune(bin, filepath.Separator) {
		return "", lookErr
	}
	for _, dir := range darwinExtraBinDirs {
		candidate := filepath.Join(dir, bin)
		info, statErr := os.Stat(candidate)
		if statErr != nil || info.IsDir() {
			continue
		}
		if info.Mode()&0o111 != 0 {
			return candidate, nil
		}
	}
	return "", lookErr
}
