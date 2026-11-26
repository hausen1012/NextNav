package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"nextnav/internal/config"
	"nextnav/internal/handler"
	"nextnav/internal/service"
	"nextnav/internal/slogx"
	"nextnav/internal/store"
)

//go:embed all:web
var staticFS embed.FS

func getStaticFS() fs.FS {
	sub, err := fs.Sub(staticFS, "web")
	if err != nil {
		panic(err)
	}
	return sub
}

func main() {
	slogx.Setup(os.Getenv("DEBUG") == "1")
	cfg := config.Load()

	st, err := store.Open(cfg.DataDir)
	if err != nil {
		slogx.Error("open store", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	svc := service.New(st)
	if err := svc.InitAdmin(cfg.AdminUsername, cfg.AdminPassword, cfg.ImportSampleData); err != nil {
		slogx.Error("init admin", "err", err)
		os.Exit(1)
	}

	appCtx, appCancel := context.WithCancel(context.Background())
	defer appCancel()
	svc.StartPeriodicChecker(appCtx, cfg.CheckInterval)

	api := handler.NewAPI(svc, getStaticFS(), cfg.FaviconAllowedDomains)

	addr := ":" + cfg.Port
	if cfg.Host != "" {
		addr = net.JoinHostPort(cfg.Host, cfg.Port)
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler.NewRouter(api),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slogx.Info("listening", "addr", srv.Addr, "dataDir", cfg.DataDir,
			"checkInterval", cfg.CheckInterval)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slogx.Error("serve", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slogx.Error("shutdown", "err", err)
	}
	slogx.Info("stopped")
}
