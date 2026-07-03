# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY services/auth-gateway ./services/auth-gateway
RUN pnpm install --filter @services/auth-gateway... --frozen-lockfile=false
RUN pnpm --filter @services/auth-gateway build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/services/auth-gateway/dist ./dist
COPY --from=build /workspace/services/auth-gateway/package.json ./package.json
RUN npm install --omit=dev
EXPOSE 4100
CMD ["node", "dist/index.js"]
