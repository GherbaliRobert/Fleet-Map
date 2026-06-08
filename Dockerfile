FROM node:20-alpine

WORKDIR /app

# Dependențe (fără devDependencies)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    TCP_PORT=5027

# 3000 = web/API (HTTP, în spatele reverse-proxy-ului) · 5027 = TCP dispozitive Teltonika
EXPOSE 3000 5027

# Baza de date embedded (PGlite) + secrete + chei VAPID persistă aici
VOLUME ["/app/data"]

CMD ["node", "server.js"]
