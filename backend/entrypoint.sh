#!/bin/bash

set -e

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
while ! nc -z $DB_HOST $DB_PORT; do
  sleep 0.1
done
echo "PostgreSQL started"

# Wait for Redis
echo "Waiting for Redis..."
while ! nc -z $REDIS_HOST $REDIS_PORT; do
  sleep 0.1
done
echo "Redis started"

# Wait for MinIO
echo "Waiting for MinIO..."
while ! curl -f http://$MINIO_HOST:$MINIO_PORT/minio/health/live; do
  sleep 0.1
done
echo "MinIO started"

# Run migrations and collect static files only if requested
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running migrations..."
    python manage.py migrate

    echo "Collecting static files..."
    python manage.py collectstatic --noinput

    if [ "$DJANGO_ENV" = "development" ]; then
        echo "Creating superuser..."
        python manage.py createsuperuser --noinput --username admin --email admin@example.com || true
    fi
fi

# Execute the command passed to the container
exec "$@"