#!/bin/bash

set -e

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
while ! nc -z $DB_HOST $DB_PORT; do
  sleep 0.1
done
echo "PostgreSQL started"

echo "Waiting for Redis..."
while ! nc -z $REDIS_HOST $REDIS_PORT; do
  sleep 0.1
done
echo "Redis started"

echo "Waiting for MinIO..."
while ! curl -f http://$MINIO_HOST:$MINIO_PORT/minio/health/live; do
  sleep 0.1
done
echo "MinIO started"

if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running makemigrations..."
    python manage.py makemigrations
    echo "Running migrations..."
    python manage.py migrate

    echo "Collecting static files..."
    python manage.py collectstatic --noinput

    if [ "$DJANGO_ENV" = "development" ]; then
        echo "Creating development superuser..."
        export DJANGO_SUPERUSER_PHONE_NUMBER=${DJANGO_SUPERUSER_PHONE_NUMBER:-"+12025550123"}
        export DJANGO_SUPERUSER_PASSWORD=${DJANGO_SUPERUSER_PASSWORD:-"admin123"}
        
        python manage.py createsuperuser \
            --no-input \
            --user_type "staff" \
            || echo "Superuser already exists or could not be created."
    fi
fi

# Execute the command passed to the container
exec "$@"