# Stage 1: Install dependencies
FROM node:18-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm ci --production --no-audit --progress=false \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Stage 2: Copy source and build (if applicable)
FROM node:18-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Uncomment if you have a build step (TypeScript/React)
# RUN npm run build

# Stage 3: Use Distroless for production
FROM gcr.io/distroless/nodejs18
WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
EXPOSE 8000

CMD ["index2.js"]
