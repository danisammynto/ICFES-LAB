# =============================================================================
#  ICFES Lab · Imagen de producción
# =============================================================================
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencias (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Código de la aplicación
COPY backend ./backend
COPY frontend ./frontend
COPY database ./database

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1

# Instala la base de datos si está vacía y arranca el servidor.
CMD ["sh", "-c", "node backend/src/scripts/db-setup.js --solo-si-vacia && node backend/src/server.js"]
