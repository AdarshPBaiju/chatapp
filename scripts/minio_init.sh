#!/bin/sh
/usr/bin/mc alias set myminio http://minio:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}
/usr/bin/mc mb myminio/chatapp || true
/usr/bin/mc anonymous set download myminio/chatapp/media/thumbnails
cat <<EOF > /tmp/cors.json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF
/usr/bin/mc cors set myminio/chatapp /tmp/cors.json
exit 0
