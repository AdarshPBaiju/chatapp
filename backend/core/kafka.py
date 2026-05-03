from django.conf import settings
from confluent_kafka import Producer
import logging

logger = logging.getLogger(__name__)

class KafkaProducer:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            try:
                cls._instance = Producer(settings.KAFKA_PRODUCER_CONFIG)
                logger.info("🚀 Kafka Producer Singleton initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Kafka Producer: {e}")
                return None
        return cls._instance

    @classmethod
    def produce(cls, topic, key, value):
        producer = cls.get_instance()
        if producer:
            try:
                producer.produce(topic, key=key, value=value)
                # We don't flush every time for max performance; 
                # we let the background thread handle it or flush at the end of the request if needed.
                return True
            except Exception as e:
                logger.error(f"❌ Failed to produce to Kafka: {e}")
        return False

    @classmethod
    def flush(cls):
        producer = cls.get_instance()
        if producer:
            producer.flush()
