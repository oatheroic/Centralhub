# syntax=docker/dockerfile:1

FROM postgres:16-alpine
RUN apk add --no-cache wget
COPY apps/engineering/db/migrations /migrations
COPY apps/engineering/scripts/migrate.sh /migrate.sh
RUN chmod +x /migrate.sh
ENTRYPOINT ["/migrate.sh"]
