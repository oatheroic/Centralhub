# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY services/inference-gateway ./services/inference-gateway
RUN pnpm install --filter @services/inference-gateway... --frozen-lockfile=false
RUN pnpm --filter @services/inference-gateway build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/services/inference-gateway/dist ./dist
COPY --from=build /workspace/services/inference-gateway/package.json ./package.json
RUN npm install --omit=dev
EXPOSE 4000
CMD ["node", "dist/index.js"]
