# Stage: install dependencies (cached if package*.json unchanged)
FROM mirror.gcr.io/library/node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Use npm ci for reproducible installs; adjust flags if you need devDependencies
RUN npm ci --production --no-audit --progress=false

# Final image
FROM mirror.gcr.io/library/node:18-alpine AS final
WORKDIR /app
# Copy only installed deps from the deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy app source
COPY . .
# Expose port if your app listens on one (adjust)
EXPOSE 3000
# Adjust start command if different (e.g., npm start)
CMD ["node", "index.js"]
