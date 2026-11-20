# 多阶段构建：编译阶段装全套依赖，运行阶段只保留生产依赖
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/attendance.db
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# 数据目录：在 Railway 控制台把持久卷挂载到这里，重启不丢数据
RUN mkdir -p /data
EXPOSE 4000
CMD ["node", "--no-warnings=ExperimentalWarning", "dist/server.js"]
