# syntax=docker/dockerfile:1

# Two-stage build for a service that depends on @centralhub/service-kit
# (workspace:*). `pnpm deploy` produces a self-contained tree with the
# workspace dependency's built dist copied in — a plain `npm install` in the
# runtime stage (the older auth-gateway/inference-gateway pattern) can't
# resolve the workspace: protocol.
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY packages/service-kit ./packages/service-kit
COPY services/_template ./services/_template
RUN pnpm install --filter @services/template... --frozen-lockfile=false
# `...` = this package plus its workspace deps, built in topological order
# (service-kit first).
RUN pnpm --filter @services/template... build
RUN pnpm --filter @services/template deploy --prod /deploy

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /deploy /app
EXPOSE 4200
CMD ["node", "dist/index.js"]
