package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/segmentio/kafka-go"
)

type Event struct {
	Topic     string    `json:"-"`
	Key       string    `json:"key"`
	Type      string    `json:"type"`
	Payload   any       `json:"payload"`
	Timestamp time.Time `json:"timestamp"`
}

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr:         kafka.TCP(brokers...),
			Balancer:     &kafka.LeastBytes{},
			MaxAttempts:  5,
			WriteTimeout: 10 * time.Second,
			Async:        true,
			BatchSize:    100,              // High-throughput batching
			BatchTimeout: 10 * time.Millisecond, // Low latency batch flush
			Compression:  kafka.Zstd,       // Extreme compression ratio
		},
	}
}

func (p *Producer) Publish(ctx context.Context, event Event) error {
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Topic: event.Topic,
		Key:   []byte(event.Key),
		Value: body,
	})
}

func (p *Producer) Close() error {
	return p.writer.Close()
}

func (p *Producer) CloseSync() error {
	// For graceful shutdowns where we want to ensure all async messages are flushed
	return p.writer.Close()
}

type Consumer struct {
	reader *kafka.Reader
}

func NewConsumer(brokers []string, groupID, topic string) *Consumer {
	return &Consumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:                brokers,
			GroupID:                groupID,
			Topic:                  topic,
			MinBytes:               1e5,  // 100KB (Better batching)
			MaxBytes:               1e7,  // 10MB
			QueueCapacity:          1000, // Large internal buffer
			WatchPartitionChanges: true,
		}),
	}
}

func (c *Consumer) Consume(ctx context.Context, handler func(Event) error) error {
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			return err
		}

		var event Event
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			continue // Skip malformed events
		}
		event.Topic = msg.Topic

		if err := handler(event); err != nil {
			continue // Maintain stream even on handler error
		}
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}
