package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"chatapp/services/go/go-media/internal/processor"
	"chatapp/services/go/shared/platform/auth"
	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/httpx"
	"chatapp/services/go/shared/platform/storage"
	"github.com/google/uuid"
)

var (
	s3Client    *storage.S3Client
	authClient  *auth.VerifierClient
)

func main() {
	// 1. Configuration
	port := os.Getenv("SERVICE_PORT")
	if port == "" {
		port = "8084"
	}
	
	internalSecret := os.Getenv("INTERNAL_SERVICE_SECRET")
	goAuthURL := os.Getenv("GO_AUTH_URL")
	
	s3Endpoint := os.Getenv("MINIO_ENDPOINT")
	if s3Endpoint == "" {
		s3Endpoint = "minio:9000"
	}
	s3AccessKey := os.Getenv("MINIO_ACCESS_KEY")
	s3SecretKey := os.Getenv("MINIO_SECRET_KEY")
	s3Bucket := os.Getenv("MINIO_BUCKET_NAME")
	if s3Bucket == "" {
		s3Bucket = "chatapp"
	}
	s3External := os.Getenv("MINIO_EXTERNAL_URL")

	addr := flag.String("addr", ":"+port, "http service address")
	flag.Parse()

	// 2. Initialize Clients
	var err error
	s3Client, err = storage.NewS3Client(storage.S3Config{
		Endpoint:        s3Endpoint,
		AccessKey:       s3AccessKey,
		SecretKey:       s3SecretKey,
		BucketName:      s3Bucket,
		UseSSL:          false,
		ExternalEndpoint: s3External,
	})
	if err != nil {
		log.Fatalf("failed to initialize s3 client: %v", err)
	}

	authClient = auth.NewVerifierClient(goAuthURL, internalSecret)

	kafkaBrokers := os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:29092"
	}
	producer := messaging.NewProducer(strings.Split(kafkaBrokers, ","))
	defer producer.Close()

	proc := processor.NewMediaProcessor(s3Client, producer)

	// 3. Background Processing
	consumer := messaging.NewConsumer(strings.Split(kafkaBrokers, ","), "go-media-group", "chat.delivery")
	defer consumer.Close()

	go func() {
		debug.Print("GO-MEDIA", "Starting background processor...")
		err := consumer.Consume(ctx, func(event messaging.Event) error {
			return proc.ProcessEvent(ctx, event)
		})
		if err != nil {
			log.Printf("consumer error: %v", err)
		}
	}()

	// 4. Routing
	mux := http.NewServeMux()
	
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Message: "go-media is healthy"})
	})

	mux.HandleFunc("POST /api/v1/media/signed-url", handleSignedURL)

	// 4. Start Server
	srv := &http.Server{
		Addr:    *addr,
		Handler: mux,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		debug.Print("GO-MEDIA", fmt.Sprintf("Service listening on %s", *addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	<-ctx.Done()
	debug.Print("GO-MEDIA", "Shutting down gracefully...")
	
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}
}

type SignedURLRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
}

type SignedURLResponse struct {
	SignedURL string `json:"signed_url"`
	S3Key     string `json:"s3_key"`
	ExpiresAt string `json:"expires_at"`
}

func handleSignedURL(w http.ResponseWriter, r *http.Request) {
	// 1. Verify Auth
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		authHeader = r.URL.Query().Get("token")
	}
	token := strings.TrimPrefix(authHeader, "Bearer ")
	if token == "" {
		httpx.WriteError(w, http.StatusUnauthorized, "Unauthorized: Token missing")
		return
	}

	userID, err := authClient.VerifyToken(r.Context(), token)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "Unauthorized: Invalid token")
		return
	}

	// 2. Parse Request
	var req SignedURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Filename == "" {
		httpx.WriteError(w, http.StatusBadRequest, "Filename is required")
		return
	}

	// 3. Generate Key and URL
	// Pattern: originals/userID/UUID/filename
	fileUUID := uuid.New().String()
	key := fmt.Sprintf("originals/%s/%s/%s", userID, fileUUID, req.Filename)
	
	expires := 15 * time.Minute
	presignedURL, err := s3Client.GeneratePresignedPutURL(r.Context(), key, req.ContentType, expires)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to generate signed URL")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{
		Status: "ok",
		Data: SignedURLResponse{
			SignedURL: presignedURL.String(),
			S3Key:     key,
			ExpiresAt: time.Now().Add(expires).Format(time.RFC3339),
		},
	})
}
