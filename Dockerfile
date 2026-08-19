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

RUN npx prisma generate && npm run build && npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
