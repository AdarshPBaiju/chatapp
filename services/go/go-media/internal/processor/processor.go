package processor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"strings"

	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/messaging"
	"chatapp/services/go/shared/platform/storage"
	"github.com/disintegration/imaging"
)

type MediaProcessor struct {
	s3Client *storage.S3Client
	producer *messaging.Producer
}

func NewMediaProcessor(s3 *storage.S3Client, prod *messaging.Producer) *MediaProcessor {
	return &MediaProcessor{
		s3Client: s3,
		producer: prod,
	}
}

func (p *MediaProcessor) ProcessEvent(ctx context.Context, event messaging.Event) error {
	if strings.ToUpper(event.Type) != "CHAT_DELIVERY" {
		return nil
	}

	payload, ok := event.Payload.(map[string]any)
	if !ok {
		return nil
	}

	attachment, ok := payload["attachment"].(map[string]any)
	if !ok || attachment == nil {
		return nil
	}

	// Check if already processed
	if processed, _ := attachment["processed"].(bool); processed {
		return nil
	}

	s3Key, _ := attachment["s3_key"].(string)
	if s3Key == "" {
		return nil
	}

	mediaType, _ := attachment["type"].(string)
	
	debug.Print("GO-MEDIA", fmt.Sprintf("Processing media: %s (Type: %s)", s3Key, mediaType))

	switch strings.ToUpper(mediaType) {
	case "IMAGE":
		return p.processImage(ctx, s3Key, attachment, event)
	default:
		debug.Print("GO-MEDIA", "Unsupported media type for processing: "+mediaType)
		return nil
	}
}

func (p *MediaProcessor) processImage(ctx context.Context, key string, attachment map[string]any, event messaging.Event) error {
	// 1. Download original
	obj, err := p.s3Client.GetObject(ctx, key)
	if err != nil {
		return fmt.Errorf("download original: %w", err)
	}
	defer obj.Close()

	// 2. Decode image
	img, format, err := image.Decode(obj)
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dx()

	// 3. Generate Thumbnail (max 300px)
	thumb := imaging.Fit(img, 300, 300, imaging.Lanczos)
	
	var thumbBuf bytes.Buffer
	err = imaging.Encode(&thumbBuf, thumb, imaging.JPEG) // Use WebP in production if possible
	if err != nil {
		return fmt.Errorf("encode thumbnail: %w", err)
	}

	// 4. Upload Thumbnail
	thumbKey := strings.Replace(key, "originals/", "thumbnails/", 1) + ".thumb.jpg"
	_, err = p.s3Client.PutObject(ctx, thumbKey, thumbBuf.Bytes(), "image/jpeg")
	if err != nil {
		return fmt.Errorf("upload thumbnail: %w", err)
	}

	// 5. Update Attachment Metadata
	attachment["processed"] = true
	attachment["thumbnail_key"] = thumbKey
	attachment["width"] = width
	attachment["height"] = height
	attachment["format"] = format
	
	// Generate public-facing thumbnail URL (assuming bucket policy set in docker-compose)
	attachment["thumbnail_url"] = fmt.Sprintf("/media/%s", thumbKey)

	debug.Print("GO-MEDIA", "Successfully processed image: "+key)

	// 6. Re-publish the updated event back to chat.delivery
	// This ensures connected clients receive the updated metadata
	event.Type = "CHAT_UPDATE" // Use a specific type for updates if needed
	return p.producer.Publish(ctx, event)
}

// Helper to decode various formats
func init() {
	image.RegisterFormat("jpeg", "jpeg", jpeg.Decode, jpeg.DecodeConfig)
	image.RegisterFormat("png", "png", png.Decode, png.DecodeConfig)
}
