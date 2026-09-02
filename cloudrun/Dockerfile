FROM node:20-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
