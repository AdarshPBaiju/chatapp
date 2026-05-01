package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	sharedconfig "chatapp/services/go/shared/platform/config"
)

type TokenMaterial struct {
	SigningSeed   string `json:"signing_seed"`
	EncryptionKey string `json:"encryption_key"`
}

type Config struct {
	Service               sharedconfig.ServiceConfig
	ActiveKID             string
	TokenKeyring          map[string]TokenMaterial
	PostgresDSN           string
	SessionActivityGrace  time.Duration
	EnrichmentURL         string
	RiskURL               string
}

func Load() (Config, error) {
	keyringRaw := envOrDefault("AUTH_TOKEN_KEYRING", `{"v1":{"signing_seed":"development-signing-seed","encryption_key":"development-encryption-key"}}`)
	var keyring map[string]TokenMaterial
	if err := json.Unmarshal([]byte(keyringRaw), &keyring); err != nil {
		return Config{}, fmt.Errorf("parse auth token keyring: %w", err)
	}

	return Config{
		Service:              sharedconfig.Load("go-auth", "8080"),
		ActiveKID:            envOrDefault("AUTH_TOKEN_ACTIVE_KID", "v1"),
		TokenKeyring:         keyring,
		PostgresDSN:          buildPostgresDSN(),
		SessionActivityGrace: durationFromEnv("GO_AUTH_SESSION_ACTIVITY_GRACE_SECONDS", 300*time.Second),
		EnrichmentURL:        envOrDefault("GO_ENRICHMENT_URL", "http://go-enrichment:8081"),
		RiskURL:              envOrDefault("GO_RISK_URL", "http://go-risk:8082"),
	}, nil
}

func buildPostgresDSN() string {
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		return dsn
	}
	host := envOrDefault("DB_HOST", "db")
	port := envOrDefault("DB_PORT", "5432")
	name := envOrDefault("DB_NAME", "chatapp")
	user := envOrDefault("DB_USER", "postgres")
	password := envOrDefault("DB_PASSWORD", "password")
	sslmode := envOrDefault("DB_SSLMODE", "disable")
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user,
		password,
		host,
		port,
		name,
		sslmode,
	)
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func durationFromEnv(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}
