# Targets: api and web (docker compose, separate frontend and backend) and playground (single image for free hosts)

FROM node:22.18.0-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY config ./config
COPY packages ./packages
COPY apps ./apps
COPY data ./data
RUN npm run build --workspace apps/web && npm prune --omit=dev --no-audit --no-fund

FROM node:22.18.0-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATABASE_FILE=/tmp/dwellcast/dwellcast.db
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "apps/api/src/server.ts"]

FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080

FROM node:22.18.0-bookworm-slim AS playground
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 SERVE_WEB=true DATABASE_FILE=/tmp/dwellcast/dwellcast.db
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "apps/api/src/server.ts"]
