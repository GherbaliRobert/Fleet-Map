FROM node:20-alpine

WORKDIR /app

# Dependențe reproducibile (din package-lock), fără devDependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    TCP_PORT=5027

# 3000 = web/API (HTTP, în spatele reverse-proxy-ului) · 5027 = TCP dispozitive Teltonika
EXPOSE 3000 5027

# Baza de date embedded (PGlite) + secrete + chei VAPID persistă aici
VOLUME ["/app/data"]

# Rulează ca utilizator non-root (imaginea node:* are deja userul `node`)
RUN chown -R node:node /app
USER node

# Healthcheck: API-ul HTTP răspunde (fetch e global în Node 20, fără curl/wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
