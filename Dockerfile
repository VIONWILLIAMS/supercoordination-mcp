FROM node:18-bullseye-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install

COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "src/server.js"]
