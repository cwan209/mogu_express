FROM node:20-alpine

# Alpine 装时区数据,Node 的 Date/toLocaleString 才能识别 TZ
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

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
ENV TZ=Asia/Shanghai

EXPOSE 4000
CMD ["node", "server.js"]
