package service

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/httpx"
	"chatapp/services/go/shared/platform/messaging"
	authconfig "chatapp/services/go/go-auth/internal/config"
	authtypes "chatapp/services/go/go-auth/internal/types"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwe"
	"github.com/lestrrat-go/jwx/v2/jws"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"
	"net/http"
)

// ValidationError represents a client-side validation error with a message and error code.
type ValidationError struct {
	Message   string
	ErrorCode string
}

func (e *ValidationError) Error() string {
	return e.Message
}

// Verifier handles authentication token verification and security checks.
type Verifier struct {
	cfg        authconfig.Config
	redis      *redis.Client
	pg         *pgxpool.Pool
	httpClient *http.Client
	producer   *messaging.Producer
}

// New initializes a new Verifier with the given configuration.
func New(cfg authconfig.Config) (*Verifier, error) {
	redisOpts, err := redis.ParseURL(cfg.Service.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	pgPool, err := pgxpool.New(context.Background(), cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}

	return &Verifier{
		cfg:   cfg,
		redis: redis.NewClient(redisOpts),
		pg:    pgPool,
		producer: messaging.NewProducer([]string{cfg.Service.KafkaBootstrapServers}),
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				MaxIdleConnsPerHost: 20,
			},
		},
	}, nil
}

// Redis returns the underlying Redis client.
func (v *Verifier) Redis() *redis.Client {
	return v.redis
}

// Close releases resources held by the Verifier.
func (v *Verifier) Close() {
	if v.redis != nil {
		_ = v.redis.Close()
	}
	if v.pg != nil {
		v.pg.Close()
	}
	if v.producer != nil {
		_ = v.producer.Close()
	}
}

// Verify validates the given token and performs security checks.
func (v *Verifier) Verify(ctx context.Context, req authtypes.VerifyRequest) (*authtypes.VerifyResponseData, error) {
	if req.Token == "" {
		return nil, &ValidationError{
			Message:   "Token is required.",
			ErrorCode: "AUTH_TOKEN_INVALID",
		}
	}

	payload, err := v.decryptAndVerifyToken(req.Token, req.GracePeriodSec)
	if err != nil {
		if errors.Is(err, errExpiredToken) {
			errorCode := "AUTH_ACCESS_EXPIRED"
			if req.ExpectedType == "refresh" {
				errorCode = "AUTH_REFRESH_EXPIRED"
			}
			return nil, &ValidationError{
				Message:   "The authentication token has expired",
				ErrorCode: errorCode,
			}
		}
		return nil, &ValidationError{
			Message:   "Invalid or tampered token protocol",
			ErrorCode: "AUTH_TOKEN_TAMPERED",
		}
	}

	if req.ExpectedType != "" && asString(payload["type"]) != req.ExpectedType {
		return nil, &ValidationError{
			Message:   fmt.Sprintf("Invalid token type: expected %s.", req.ExpectedType),
			ErrorCode: "AUTH_TOKEN_TAMPERED",
		}
	}

	jti := asString(payload["jti"])
	subjectID := firstNonEmpty(asString(payload["sub"]), asString(payload["user_id"]))
	if subjectID != "" {
		payload["user_id"] = subjectID
	}
	debug.Print("GO-AUTH", fmt.Sprintf("Verifying token for User: %s (JTI: %s)", subjectID, jti))

	// High-Performance Parallel Execution
	g, gCtx := errgroup.WithContext(ctx)

	var (
		blacklisted    bool
		sessionActive  bool
		currentLoc     *authtypes.Location
		lastSessionLoc *authtypes.Location
		lastSeenAt     time.Time
	)

	// 1. Blacklist Check
	g.Go(func() error {
		var err error
		blacklisted, err = v.isBlacklisted(gCtx, jti)
		return err
	})

	// 2. Session Activity Check
	if req.CheckSession {
		g.Go(func() error {
			var err error
			sessionActive, err = v.isSessionActive(
				gCtx,
				subjectID,
				asString(payload["sid"]),
				jti,
				asString(payload["partner_jti"]),
				req.ExpectedType,
				asString(payload["scope"]),
			)
			return err
		})
	} else {
		sessionActive = true
	}

	// 3. GeoIP Enrichment
	g.Go(func() error {
		currentLoc = v.getGeoLocation(gCtx, req.RequestContext.IPAddress)
		return nil
	})

	// 4. Fetch Last Session for Anomaly Detection
	g.Go(func() error {
		var err error
		lastSessionLoc, lastSeenAt, err = v.fetchLastSessionLocation(gCtx, subjectID, asString(payload["sid"]))
		return err
	})

	if err := g.Wait(); err != nil {
		return nil, fmt.Errorf("parallel validation failed: %w", err)
	}

	if blacklisted {
		return nil, &ValidationError{
			Message:   "This session has been revoked by the system.",
			ErrorCode: "AUTH_REVOKED_BY_SYSTEM",
		}
	}

	if req.RequestContext.Fingerprint == "" || asString(payload["fpt"]) != req.RequestContext.Fingerprint {
		return nil, &ValidationError{
			Message:   "Security breach: Token context mismatch detected.",
			ErrorCode: "AUTH_TOKEN_TAMPERED",
		}
	}

	if !sessionActive {
		return nil, &ValidationError{
			Message:   "Session is no longer active.",
			ErrorCode: "AUTH_SESSION_EXPIRED",
		}
	}

	riskScore := v.calculateRiskScore(ctx, currentLoc, lastSessionLoc, lastSeenAt)
	debug.Print("GO-AUTH", fmt.Sprintf("Verification complete. Risk: %d | Location: %+v", riskScore, currentLoc))

	// Fire-and-forget security event to Kafka
	err = v.producer.Publish(ctx, messaging.Event{
		Topic: "security_events",
		Key:   subjectID,
		Type:  "auth.verified",
		Payload: map[string]any{
			"user_id":    subjectID,
			"session_id": asString(payload["sid"]),
			"risk_score": riskScore,
			"location":   currentLoc,
			"ip":         req.RequestContext.IPAddress,
		},
	})
	if err != nil {
		debug.Print("GO-AUTH", fmt.Sprintf("Failed to publish security event: %v", err))
	}

	return &authtypes.VerifyResponseData{
		Payload:   payload,
		RiskScore: riskScore,
		Location:  currentLoc,
	}, nil
}

var errExpiredToken = errors.New("expired token")

func (v *Verifier) decryptAndVerifyToken(token string, gracePeriodSec int64) (map[string]any, error) {
	jweMsg, err := jwe.ParseString(token)
	if err != nil {
		return nil, err
	}
	kid := v.cfg.ActiveKID
	if protected := jweMsg.ProtectedHeaders(); protected != nil && protected.KeyID() != "" {
		kid = protected.KeyID()
	}

	encKey, err := v.encryptionKey(kid)
	if err != nil {
		return nil, err
	}
	plaintext, err := jwe.Decrypt([]byte(token), jwe.WithKey(jwa.DIRECT, encKey))
	if err != nil {
		return nil, err
	}

	jwsMsg, err := jws.Parse(plaintext)
	if err != nil {
		return nil, err
	}
	signKID := kid
	signatures := jwsMsg.Signatures()
	if len(signatures) > 0 && signatures[0].ProtectedHeaders() != nil && signatures[0].ProtectedHeaders().KeyID() != "" {
		signKID = signatures[0].ProtectedHeaders().KeyID()
	}

	verifyKey, err := v.verificationKey(signKID)
	if err != nil {
		return nil, err
	}
	verified, err := jws.Verify(plaintext, jws.WithKey(jwa.EdDSA, verifyKey))
	if err != nil {
		return nil, err
	}

	var payload map[string]any
	if err := json.Unmarshal(verified, &payload); err != nil {
		return nil, err
	}

	expUnix, ok := numericToInt64(payload["exp"])
	if !ok {
		return nil, fmt.Errorf("token exp missing")
	}
	if expUnix+gracePeriodSec < time.Now().UTC().Unix() {
		return nil, errExpiredToken
	}

	return payload, nil
}

func (v *Verifier) encryptionKey(kid string) ([]byte, error) {
	material, ok := v.cfg.TokenKeyring[kid]
	if !ok {
		return nil, fmt.Errorf("unknown token key id")
	}
	sum := sha256.Sum256([]byte(material.EncryptionKey))
	return sum[:], nil
}

func (v *Verifier) verificationKey(kid string) (ed25519.PublicKey, error) {
	material, ok := v.cfg.TokenKeyring[kid]
	if !ok {
		return nil, fmt.Errorf("unknown token key id")
	}
	sum := sha256.Sum256([]byte(material.SigningSeed))
	privateKey := ed25519.NewKeyFromSeed(sum[:])
	publicKey := privateKey.Public().(ed25519.PublicKey)
	return publicKey, nil
}

func (v *Verifier) isBlacklisted(ctx context.Context, jti string) (bool, error) {
	if jti == "" {
		return false, nil
	}
	result, err := v.redis.Get(ctx, "blacklist:"+jti).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("redis blacklist lookup: %w", err)
	}
	return result != "", nil
}

func (v *Verifier) isInGrace(ctx context.Context, sessionID, jti string) (bool, error) {
	if sessionID == "" || jti == "" {
		return false, nil
	}
	result, err := v.redis.Get(ctx, "grace_jti:"+sessionID+":"+jti).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("redis grace lookup: %w", err)
	}
	return result != "", nil
}

func (v *Verifier) isSessionActive(
	ctx context.Context,
	userID, sessionID, jti, partnerJTI, tokenType, sessionScope string,
) (bool, error) {
	blacklisted, err := v.isBlacklisted(ctx, jti)
	if err != nil {
		return false, err
	}
	if blacklisted {
		return false, nil
	}

	partnerBlacklisted, err := v.isBlacklisted(ctx, partnerJTI)
	if err != nil {
		return false, err
	}
	if partnerBlacklisted {
		return false, nil
	}

	if sessionScope == "revoke_only" {
		return true, nil
	}

	sessionFound, err := v.lookupActiveSession(ctx, userID, sessionID, jti, tokenType, true)
	if err != nil {
		return false, err
	}
	if sessionFound {
		return true, nil
	}

	inGrace, err := v.isInGrace(ctx, sessionID, jti)
	if err != nil {
		return false, err
	}
	if !inGrace {
		return false, nil
	}

	return v.lookupActiveSession(ctx, userID, sessionID, "", tokenType, false)
}

func (v *Verifier) lookupActiveSession(
	ctx context.Context,
	userID, sessionID, jti, tokenType string,
	requireIdentifiers bool,
) (bool, error) {
	if userID == "" || sessionID == "" {
		return false, nil
	}

	threshold := time.Now().UTC().Add(-v.cfg.SessionActivityGrace)
	var query string
	var args []any

	if requireIdentifiers {
		if jti == "" {
			return false, nil
		}
		if tokenType == "refresh" {
			query = `
				SELECT 1
				FROM authentication_authsession
				WHERE user_id = $1
				  AND session_id = $2
				  AND refresh_jti = $3
				  AND is_active = TRUE
				  AND expires_at > $4
				LIMIT 1
			`
			args = []any{userID, sessionID, jti, threshold}
		} else {
			query = `
				SELECT 1
				FROM authentication_authsession
				WHERE user_id = $1
				  AND session_id = $2
				  AND access_jti = $3
				  AND is_active = TRUE
				  AND expires_at > $4
				LIMIT 1
			`
			args = []any{userID, sessionID, jti, threshold}
		}
	} else {
		query = `
			SELECT 1
			FROM authentication_authsession
			WHERE user_id = $1
			  AND session_id = $2
			  AND is_active = TRUE
			  AND expires_at > $3
			LIMIT 1
		`
		args = []any{userID, sessionID, threshold}
	}

	var exists int
	err := v.pg.QueryRow(ctx, query, args...).Scan(&exists)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return false, fmt.Errorf("postgres session lookup: %w", err)
}

func (v *Verifier) fetchLastSessionLocation(ctx context.Context, userID, excludeSessionID string) (*authtypes.Location, time.Time, error) {
	if userID == "" {
		return nil, time.Time{}, nil
	}

	query := `
		SELECT city, country_code, latitude, longitude, last_seen_at
		FROM authentication_authsession
		WHERE user_id = $1
		  AND session_id != $2
		  AND is_active = TRUE
		  AND latitude IS NOT NULL
		  AND longitude IS NOT NULL
		ORDER BY last_seen_at DESC
		LIMIT 1
	`
	var (
		city, countryCode string
		lat, lon          float64
		lastSeenAt        time.Time
	)

	err := v.pg.QueryRow(ctx, query, userID, excludeSessionID).Scan(&city, &countryCode, &lat, &lon, &lastSeenAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, time.Time{}, nil
		}
		return nil, time.Time{}, fmt.Errorf("fetch last session loc: %w", err)
	}

	return &authtypes.Location{
		City:        city,
		CountryCode: countryCode,
		Latitude:    lat,
		Longitude:   lon,
	}, lastSeenAt, nil
}

func (v *Verifier) getGeoLocation(ctx context.Context, ip string) *authtypes.Location {
	if ip == "" || ip == "127.0.0.1" || ip == "::1" {
		return nil
	}

	payload, err := json.Marshal(map[string]string{"ip": ip})
	if err != nil {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, "POST", v.cfg.EnrichmentURL+"/api/v1/enrich/ip", bytes.NewBuffer(payload))
	if err != nil {
		return nil
	}
	req.Header.Set("X-Internal-Service-Secret", v.cfg.Service.InternalServiceSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var apiResp httpx.APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil
	}

	if apiResp.Status != "ok" {
		return nil
	}

	b, err := json.Marshal(apiResp.Data)
	if err != nil {
		return nil
	}
	var loc authtypes.Location
	if err := json.Unmarshal(b, &loc); err != nil {
		return nil
	}

	return &loc
}

func (v *Verifier) calculateRiskScore(ctx context.Context, current, last *authtypes.Location, lastSeenAt time.Time) int {
	if current == nil || last == nil || lastSeenAt.IsZero() {
		return 0
	}

	payload, err := json.Marshal(map[string]any{
		"current_location": current,
		"last_location":    last,
		"last_seen_at":     lastSeenAt,
	})
	if err != nil {
		return 0
	}

	req, err := http.NewRequestWithContext(ctx, "POST", v.cfg.RiskURL+"/api/v1/score/login", bytes.NewBuffer(payload))
	if err != nil {
		return 0
	}
	req.Header.Set("X-Internal-Service-Secret", v.cfg.Service.InternalServiceSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()

	var apiResp httpx.APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return 0
	}

	if data, ok := apiResp.Data.(map[string]any); ok {
		if score, ok := data["risk_score"].(float64); ok {
			return int(score)
		}
	}

	return 0
}


func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func numericToInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case float64:
		return int64(v), true
	case float32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	case json.Number:
		i, err := v.Int64()
		return i, err == nil
	default:
		return 0, false
	}
}
