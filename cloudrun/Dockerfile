# Tahap build — bundel orkestrasi TypeScript jadi satu file CJS.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
RUN npm run build

# Tahap runtime — tanpa devDependencies, tanpa sumber TypeScript.
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
