FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "src/server.js"]
