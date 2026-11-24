package webembed

import (
	"embed"
	"io/fs"
)

// dist holds the Vite build output. A placeholder index.html is committed so
// the binary compiles before the frontend is built; the Dockerfile replaces
// this directory with the real build.
//
//go:embed all:dist
var distFS embed.FS

func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
