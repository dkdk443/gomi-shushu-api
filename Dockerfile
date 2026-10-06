# ローカル開発・確認用（Node 版には認証がないので、公開しない）
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# 実行時の依存はないので npm install はしない
COPY package.json ./
COPY src ./src
COPY data/*.json ./data/

USER node
EXPOSE 3000
CMD ["node", "src/main.ts"]
