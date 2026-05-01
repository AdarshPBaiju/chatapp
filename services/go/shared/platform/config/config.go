package config

import (
	"os"
	"strconv"
	"time"
)

const (
	defaultReadTimeout  = 5 * time.Second
	defaultWriteTimeout = 10 * time.Second
)

type ServiceConfig struct {
	Name                  string
	Port                  string
	InternalServiceSecret string
	RedisURL              string
	KafkaBootstrapServers string
	ReadTimeout           time.Duration
	WriteTimeout          time.Duration
}

func Load(serviceName, defaultPort string) ServiceConfig {
	return ServiceConfig{
		Name:                  envOrDefault("SERVICE_NAME", serviceName),
		Port:                  envOrDefault("SERVICE_PORT", defaultPort),
		InternalServiceSecret: os.Getenv("INTERNAL_SERVICE_SECRET"),
		RedisURL:              os.Getenv("REDIS_URL"),
		KafkaBootstrapServers: os.Getenv("KAFKA_BOOTSTRAP_SERVERS"),
		ReadTimeout:           durationFromEnv("SERVICE_READ_TIMEOUT_SECONDS", defaultReadTimeout),
		WriteTimeout:          durationFromEnv("SERVICE_WRITE_TIMEOUT_SECONDS", defaultWriteTimeout),
	}
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
