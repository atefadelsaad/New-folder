FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json ./package.json
RUN npm install --omit=dev

COPY server/src ./src
COPY db ./db
COPY it-warehouse_1.html ./it-warehouse_1.html

EXPOSE 3002

CMD ["node", "src/index.js"]
