package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3Config struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	BucketName      string
	UseSSL          bool
	ExternalEndpoint string
}

type S3Client struct {
	client      *minio.Client
	core        *minio.Core
	presigner   *minio.Client
	bucketName  string
	externalURL string
}

func NewS3Client(cfg S3Config) (*S3Client, error) {
	opts := &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	}
	client, err := minio.New(cfg.Endpoint, opts)
	if err != nil {
		return nil, fmt.Errorf("initialize minio client: %w", err)
	}

	core, err := minio.NewCore(cfg.Endpoint, opts)
	if err != nil {
		return nil, fmt.Errorf("initialize minio core client: %w", err)
	}

	var presigner *minio.Client = client
	if cfg.ExternalEndpoint != "" {
		ext, err := url.Parse(cfg.ExternalEndpoint)
		if err == nil {
			p, err := minio.New(ext.Host, &minio.Options{
				Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
				Secure: ext.Scheme == "https",
			})
			if err == nil {
				presigner = p
			}
		}
	}

	return &S3Client{
		client:      client,
		core:        core,
		presigner:   presigner,
		bucketName:  cfg.BucketName,
		externalURL: cfg.ExternalEndpoint,
	}, nil
}

// GeneratePresignedPutURL generates a temporary URL for uploading a file directly to S3.
func (s *S3Client) GeneratePresignedPutURL(ctx context.Context, key string, contentType string, expires time.Duration) (*url.URL, error) {
	// Use PresignHeader to include Content-Type in the signature
	extraHeaders := make(http.Header)
	if contentType != "" {
		extraHeaders.Set("Content-Type", contentType)
	}

	// Use the presigner client which has the correct host for the signature
	presignedURL, err := s.presigner.PresignHeader(ctx, "PUT", s.bucketName, key, expires, nil, extraHeaders)
	if err != nil {
		return nil, fmt.Errorf("generate presigned put url: %w", err)
	}

	return presignedURL, nil
}

func (s *S3Client) GetBucketName() string {
	return s.bucketName
}

func (s *S3Client) StatObject(ctx context.Context, key string) (minio.ObjectInfo, error) {
	return s.client.StatObject(ctx, s.bucketName, key, minio.StatObjectOptions{})
}

func (s *S3Client) GetObject(ctx context.Context, key string) (*minio.Object, error) {
	return s.client.GetObject(ctx, s.bucketName, key, minio.GetObjectOptions{})
}

func (s *S3Client) PutObject(ctx context.Context, key string, data []byte, contentType string) (minio.UploadInfo, error) {
	reader := bytes.NewReader(data)
	return s.PutObjectStream(ctx, key, reader, int64(len(data)), contentType)
}

func (s *S3Client) PutObjectStream(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (minio.UploadInfo, error) {
	return s.client.PutObject(ctx, s.bucketName, key, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
}

// NewMultipartUpload initiates a new multipart upload and returns the Upload ID.
func (s *S3Client) NewMultipartUpload(ctx context.Context, key string, contentType string) (string, error) {
	uploadID, err := s.core.NewMultipartUpload(ctx, s.bucketName, key, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("new multipart upload: %w", err)
	}
	return uploadID, nil
}

// PresignPutPartURL generates a presigned URL for uploading a single part of a multipart upload.
func (s *S3Client) PresignPutPartURL(ctx context.Context, key string, uploadID string, partNumber int, expires time.Duration) (*url.URL, error) {
	values := make(url.Values)
	values.Set("uploadId", uploadID)
	values.Set("partNumber", fmt.Sprintf("%d", partNumber))

	presignedURL, err := s.presigner.Presign(ctx, "PUT", s.bucketName, key, expires, values)
	if err != nil {
		return nil, fmt.Errorf("presign put part url: %w", err)
	}
	return presignedURL, nil
}

// CompleteMultipartUpload finalizes a multipart upload.
func (s *S3Client) CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []minio.CompletePart) (minio.UploadInfo, error) {
	return s.core.CompleteMultipartUpload(ctx, s.bucketName, key, uploadID, parts, minio.PutObjectOptions{})
}

// AbortMultipartUpload cancels a multipart upload.
func (s *S3Client) AbortMultipartUpload(ctx context.Context, key string, uploadID string) error {
	return s.core.AbortMultipartUpload(ctx, s.bucketName, key, uploadID)
}
