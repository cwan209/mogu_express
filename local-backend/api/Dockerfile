FROM node:20-alpine

WORKDIR /app/api

# 先装依赖
COPY package.json package-lock.json* ./
RUN npm install --production

# 再拷源码
COPY server.js seed.js ./
COPY src ./src

# CF_ROOT 在 docker-compose 里 volume 挂载 /app/cloudfunctions
ENV CLOUDFUNCTIONS_ROOT=/app/cloudfunctions
ENV MONGO_URL=mongodb://mongo:27017/mogu_express?replicaSet=rs0
ENV PORT=4000

EXPOSE 4000
CMD ["node", "server.js"]
