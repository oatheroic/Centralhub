# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY apps/central-hub ./apps/central-hub
RUN pnpm install --filter @apps/central-hub... --frozen-lockfile=false
RUN pnpm --filter @apps/central-hub build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/central-hub/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
