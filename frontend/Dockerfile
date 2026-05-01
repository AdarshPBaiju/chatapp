FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./

EXPOSE 3000
CMD ["sh", "-c", "npx vite --host"]
