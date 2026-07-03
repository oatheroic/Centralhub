# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY apps/admin ./apps/admin
RUN pnpm install --filter @apps/admin... --frozen-lockfile=false
RUN pnpm --filter @apps/admin build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
