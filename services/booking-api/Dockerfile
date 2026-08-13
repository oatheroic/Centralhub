# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY services/booking-api ./services/booking-api
RUN pnpm install --filter @services/booking-api... --frozen-lockfile=false
RUN pnpm --filter @services/booking-api build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/services/booking-api/dist ./dist
COPY --from=build /workspace/services/booking-api/package.json ./package.json
RUN npm install --omit=dev
EXPOSE 4200
CMD ["node", "dist/index.js"]
