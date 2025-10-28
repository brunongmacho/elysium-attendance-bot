# Stage 1: Dependencies
FROM node:18-slim AS deps
WORKDIR /app

COPY package*.json ./

# Install build tools for sharp
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm ci --production --no-audit --progress=false --include=optional \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Stage 2: Build + copy app
FROM node:18-slim AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Stage 3: Lightweight runtime image
FROM gcr.io/distroless/nodejs18
WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
EXPOSE 8000

# ✅ Use index.js (matches your package.json)
CMD ["index.js"]
