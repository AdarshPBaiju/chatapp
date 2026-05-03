package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
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
	client     *minio.Client
	bucketName string
	externalURL string
}

func NewS3Client(cfg S3Config) (*S3Client, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("initialize minio client: %w", err)
	}

	return &S3Client{
		client:     client,
		bucketName: cfg.BucketName,
		externalURL: cfg.ExternalEndpoint,
	}, nil
}

// GeneratePresignedPutURL generates a temporary URL for uploading a file directly to S3.
func (s *S3Client) GeneratePresignedPutURL(ctx context.Context, key string, contentType string, expires time.Duration) (*url.URL, error) {
	// We could add more constraints here if needed
	
	presignedURL, err := s.client.PresignedPutObject(ctx, s.bucketName, key, expires)
	if err != nil {
		return nil, fmt.Errorf("generate presigned put url: %w", err)
	}

	// If an external URL is provided, swap the host
	if s.externalURL != "" {
		ext, err := url.Parse(s.externalURL)
		if err == nil {
			presignedURL.Host = ext.Host
			presignedURL.Scheme = ext.Scheme
		}
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
