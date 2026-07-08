# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY packages/ui ./packages/ui
COPY apps/assets ./apps/assets
RUN pnpm install --filter @apps/assets... --frozen-lockfile=false
RUN pnpm --filter @apps/assets build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/assets/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
