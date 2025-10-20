# Stage 1: Install dependencies
FROM mirror.gcr.io/library/node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --production --no-audit --progress=false

# Stage 2: Copy source and build (if applicable)
FROM mirror.gcr.io/library/node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Uncomment the next line if you have a build step (e.g., React, TypeScript)
# RUN npm run build

# Stage 3: Use Distroless for production (no DockerHub dependency)
FROM gcr.io/distroless/nodejs18
WORKDIR /app

# Copy built app and dependencies
COPY --from=builder /app .

# Optional: set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port if your app listens on one
EXPOSE 3000

# Start the bot
CMD ["index.js"]
