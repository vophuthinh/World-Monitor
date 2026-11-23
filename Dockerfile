# syntax=docker/dockerfile:1

# ---- build: install all deps, typecheck, bundle client and server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: production deps + built output only ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# .cache holds snapshot files; create it owned by the unprivileged user so a named volume inherits that.
RUN mkdir -p .cache && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
CMD ["node", "dist/server/index.js"]
