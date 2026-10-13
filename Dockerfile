FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache openssl \
    && corepack enable

COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm build \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER node
EXPOSE 3000

CMD ["pnpm", "start"]
