# Stage 1: Install dependencies
FROM node:18-slim AS deps
WORKDIR /app
COPY package*.json ./

# Install required build tools for sharp
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm ci --production --no-audit --progress=false --include=optional \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Stage 2: Copy source files
FROM node:18-slim AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Stage 3: Final runtime image (distroless)
FROM gcr.io/distroless/nodejs18
WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
EXPOSE 8000

# ✅ Entry file is index2.js with GC flags and memory limit for Koyeb (256MB RAM)
# Using 220MB limit to leave 36MB for system overhead
CMD ["--expose-gc", "--max-old-space-size=220", "index2.js"]
