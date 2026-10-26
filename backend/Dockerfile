# backend/Dockerfile
# ---- Stage 1: Install production dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ---- Stage 2: Production runner ----
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/uploads/resumes /app/uploads/logos && chown -R appuser:appgroup /app/uploads

USER appuser

EXPOSE 5000
CMD ["node", "server.js"]
