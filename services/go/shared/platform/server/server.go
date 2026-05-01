package server

import (
	"context"
	"net"
	"net/http"

	"chatapp/services/go/shared/platform/config"
	"chatapp/services/go/shared/platform/httpx"
)

func New(cfg config.ServiceConfig, handler http.Handler) *http.Server {
	loggedHandler := httpx.LoggingMiddleware(handler)

	return &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      loggedHandler,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		BaseContext: func(_ net.Listener) context.Context {
			return context.Background()
		},
	}
}
