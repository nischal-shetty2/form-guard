FROM node:20-alpine
# Prisma needs OpenSSL at runtime to pick its query engine on Alpine; without
# it the client fails to start (prisma/prisma#25817).
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/formguard.sqlite"

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

# prisma generate runs last, after the prune, so the generated client is
# guaranteed to survive into the final image. That lets the container start with
# only `prisma migrate deploy`: generating on every boot re-did build work on a
# shared-cpu-1x, delaying the port opening by tens of seconds, which is long
# enough for a Shopify webhook to time out on a cold machine.
RUN npm run build && npm prune --omit=dev && npx prisma generate

CMD ["npm", "run", "docker-start"]
