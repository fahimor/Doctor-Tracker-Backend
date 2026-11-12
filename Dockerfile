# syntax=docker/dockerfile:1

# ---------- 1. Install all deps (incl. dev) for the TypeScript build ----------
FROM node:24-alpine AS build
WORKDIR /app
# Don't download a MongoDB binary for the test-only mongodb-memory-server package.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- 2. Production-only node_modules ----------
FROM node:24-alpine AS prod-deps
WORKDIR /app
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 3. Small runtime image ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Run as the unprivileged user that ships with the node image.
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
