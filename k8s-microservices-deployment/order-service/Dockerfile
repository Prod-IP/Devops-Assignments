FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY app.js ./

USER node

EXPOSE 4000

CMD ["node", "app.js"]
