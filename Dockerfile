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

# Notă: pe Railway folosim PostgreSQL (DATABASE_URL) + secrete în env vars, deci /app/data nu
# trebuie să persiste. Railway respinge instrucțiunea VOLUME (cere Railway Volumes din dashboard).
# Dacă rulezi imaginea cu PGlite pe alt mediu Docker, persistă datele cu un bind-mount la `docker run`:
#   docker run -v /host/data:/app/data ...   (sau atașează un Railway Volume montat pe /app/data)

# Rulează ca utilizator non-root (imaginea node:* are deja userul `node`)
RUN chown -R node:node /app
USER node

# Healthcheck: API-ul HTTP răspunde (fetch e global în Node 20, fără curl/wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
