FROM node:20-alpine

# Instala dependências nativas para better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copia e instala dependências do backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copia o código
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Cria volume para o banco de dados
VOLUME ["/data"]

# Porta
EXPOSE 3000

# Variáveis de ambiente
ENV PORT=3000
ENV DB_PATH=/data/techos.db
ENV NODE_ENV=production

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/dashboard || exit 1

CMD ["node", "backend/server.js"]
