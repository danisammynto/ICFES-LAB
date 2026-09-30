# Instalación y despliegue

| Opción | Ideal para |
|---|---|
| [1. Instalación local](#1-instalación-local) | Desarrollar o probar en un computador. |
| [2. Docker](#2-docker) | Levantar la aplicación y PostgreSQL con un solo comando. |
| [3. Red local de un colegio](#3-red-local-de-un-colegio) | Usarla en un aula desde computadores, tabletas y celulares sin publicarla en Internet. |
| [4. Servidor propio (VPS)](#4-servidor-propio-vps-con-nginx-y-https) | Producción con dominio y HTTPS. |
| [5. Render o Railway](#5-render-o-railway) | Producción administrada, sin mantener un servidor. |

**Requisitos:** Node.js 22 o superior (recomendado 24 LTS) · PostgreSQL 13 o superior · opcionales: clave de la API de Anthropic (Vanty con IA) y un servidor SMTP (correos de recuperación).

---

## 1. Instalación local

### Windows

1. Instala **Node.js 24 LTS** desde [nodejs.org](https://nodejs.org) y **PostgreSQL** desde [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). Anota la contraseña del usuario `postgres` que definas durante la instalación.
2. Abre **PowerShell** en la carpeta del proyecto:

   ```powershell
   cd $HOME\Documents\icfes-lab
   copy .env.example .env
   notepad .env
   ```

3. En el `.env`, cambia `TU_CONTRASEÑA` en `DATABASE_URL` por la contraseña de `postgres` y define un `JWT_SECRET` (ver [Generar un secreto](#generar-un-secreto)).
4. Instala, crea la base de datos y arranca:

   ```powershell
   npm install
   npm run db:setup
   npm run db:demo
   npm start
   ```

5. Abre **http://localhost:3000** e inicia sesión con `demo@icfeslab.co` / `IcfesLab2026`.
6. Para los siguientes arranques, haz doble clic en `iniciar.cmd`: enciende la base de datos de prueba (si el `.env` apunta al puerto 5433), arranca el servidor y abre el navegador. `detener.cmd` apaga ambos.

> Si PowerShell responde que "la ejecución de scripts está deshabilitada", usa `npm.cmd` en lugar de `npm` (por ejemplo `npm.cmd install`) o abre el **Símbolo del sistema** (cmd).

### macOS (Homebrew)

```bash
brew install node postgresql@17
brew services start postgresql@17
cp .env.example .env
# En .env: DATABASE_URL=postgresql://TU_USUARIO_DE_MAC@localhost:5432/icfeslab  (sin contraseña)
npm install && npm run db:setup && npm run db:demo && npm start
```

### Linux (Ubuntu / Debian)

```bash
# Node.js 24 LTS (o usa nvm)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs postgresql

# Usuario y base de datos
sudo -u postgres psql -c "CREATE USER icfeslab WITH PASSWORD 'una-clave-segura' CREATEDB;"
cp .env.example .env
# En .env: DATABASE_URL=postgresql://icfeslab:una-clave-segura@localhost:5432/icfeslab

npm install && npm run db:setup && npm run db:demo && npm start
```

### Generar un secreto

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copia el resultado en `JWT_SECRET`. En desarrollo, si no lo defines, el servidor genera uno temporal y las sesiones se cierran cada vez que se reinicia.

### Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run dev` | Reinicia el servidor al cambiar el código. |
| `npm run admin:crear -- --email tu@correo.co --nombre "Tu Nombre" --password "Clave2026"` | Crea un administrador (o promueve una cuenta existente). El panel está en `/admin`. |
| `npm run db:seed` | Recarga el contenido académico después de editar `database/contenido/`. |
| `npm run db:reset` | Borra todo y reinstala la base de datos. |
| `npm test` · `npm run test:api` | Pruebas unitarias · prueba de humo de la API (con el servidor en marcha). |

> **Contraseñas con caracteres especiales en `DATABASE_URL`.** Si la contraseña tiene `@`, `:`, `/`, `#`, `%` o espacios, escríbelos codificados: `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `%` → `%25`, espacio → `%20`.

---

## 2. Docker

Requiere Docker Desktop (Windows o macOS) o Docker Engine con el complemento Compose (Linux).

1. Crea un archivo `.env` junto a `docker-compose.yml` con al menos:

   ```bash
   JWT_SECRET=pega-aqui-un-secreto-de-64-caracteres
   POSTGRES_PASSWORD=una-clave-segura
   # Opcionales
   ANTHROPIC_API_KEY=
   APP_URL=http://localhost:3000
   ```

2. Levanta todo:

   ```bash
   docker compose up --build -d
   ```

   En el primer arranque, el contenedor instala el esquema, el catálogo y el contenido (`db-setup --solo-si-vacia`). En los siguientes no toca la base de datos, así que se conservan las preguntas editadas desde el panel.

3. Abre **http://localhost:3000**.

| Tarea | Comando |
|---|---|
| Crear un administrador | `docker compose exec app node backend/src/scripts/crear-admin.js --email tu@correo.co --nombre "Tu Nombre" --password "Clave2026"` |
| Cuentas de demostración (solo pruebas) | `docker compose exec app node backend/src/scripts/db-demo.js` |
| Ver registros | `docker compose logs -f app` |
| Detener | `docker compose down` (los datos se conservan en el volumen `datos-postgres`) |
| Copia de seguridad | `docker compose exec -T db pg_dump -U icfeslab icfeslab > respaldo.sql` |
| Restaurar | `docker compose exec -T db psql -U icfeslab icfeslab < respaldo.sql` |
| Actualizar a una versión nueva | `docker compose up --build -d` |

---

## 3. Red local de un colegio

Para usar ICFES Lab en un aula sin publicarlo en Internet, instálalo en un computador de la red (opción 1 o 2) y conéctate desde los demás dispositivos por la IP de ese equipo.

1. Averigua la IP del servidor (`ipconfig` en Windows, `ip addr` en Linux), por ejemplo `192.168.1.10`.
2. En el `.env` define `APP_URL=http://192.168.1.10:3000` (así los enlaces de recuperación apuntan al servidor).
3. Permite el puerto 3000 en el firewall del servidor.
4. Desde computadores, tabletas y celulares abre `http://192.168.1.10:3000`.

Mientras `APP_URL` use `http://`, la aplicación funciona sin certificado: la cookie de sesión no se marca `Secure` y no se envían HSTS ni `upgrade-insecure-requests`. Aun así, en una red compartida los datos viajan sin cifrar; si la red no es de confianza, usa HTTPS (opción 4).

---

## 4. Servidor propio (VPS) con Nginx y HTTPS

Ejemplo para Ubuntu 24.04 con el dominio `icfes.tucolegio.edu.co`.

### 4.1 Aplicación y base de datos

```bash
sudo apt update && sudo apt install -y nginx postgresql
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs

sudo -u postgres psql -c "CREATE USER icfeslab WITH PASSWORD 'una-clave-larga-y-segura';"
sudo -u postgres createdb -O icfeslab -E UTF8 -T template0 icfeslab

sudo mkdir -p /opt/icfes-lab && sudo chown $USER /opt/icfes-lab
# Copia el proyecto a /opt/icfes-lab (git clone, scp o rsync) y luego:
cd /opt/icfes-lab
npm ci --omit=dev
cp .env.example .env && nano .env
```

`.env` de producción:

```bash
NODE_ENV=production
PORT=3000
APP_URL=https://icfes.tucolegio.edu.co
TRUST_PROXY=true
DATABASE_URL=postgresql://icfeslab:una-clave-larga-y-segura@localhost:5432/icfeslab
JWT_SECRET=<64 caracteres aleatorios>
ANTHROPIC_API_KEY=<opcional>
SMTP_HOST=smtp.tuproveedor.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="ICFES Lab <no-reply@tucolegio.edu.co>"
```

```bash
chmod 600 .env
npm run db:setup
npm run admin:crear -- --email admin@tucolegio.edu.co --nombre "Coordinación" --password "UnaClaveSegura2026"
```

### 4.2 Proceso permanente con PM2

```bash
sudo npm install -g pm2
pm2 start backend/src/server.js --name icfes-lab
pm2 save
pm2 startup   # ejecuta el comando que imprime para iniciar con el sistema
```

### 4.3 Nginx como proxy inverso

`/etc/nginx/sites-available/icfes-lab`:

```nginx
server {
    listen 80;
    server_name icfes.tucolegio.edu.co;

    # La importación de preguntas admite hasta 3 MB.
    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    # Respuestas de Vanty en streaming (SSE): sin búfer y con más tiempo de espera.
    location /api/vanty/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/icfes-lab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4.4 HTTPS con Let's Encrypt y firewall

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d icfes.tucolegio.edu.co
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

No abras los puertos 3000 ni 5432: solo Nginx debe ser accesible desde Internet.

### 4.5 Copias de seguridad y actualizaciones

```bash
# Respaldo diario a las 2:00 a. m. (crontab -e)
0 2 * * * pg_dump -Fc postgresql://icfeslab:CLAVE@localhost:5432/icfeslab > /var/backups/icfeslab-$(date +\%F).dump

# Actualizar la aplicación
cd /opt/icfes-lab && git pull && npm ci --omit=dev && npm run db:setup && pm2 restart icfes-lab
```

`npm run db:setup` es seguro sobre una base existente: actualiza el catálogo y el contenido sin borrar datos de los estudiantes. El proyecto no incluye un sistema de migraciones, así que si una versión nueva modifica `schema.sql` aplica ese cambio con un script SQL propio antes de reiniciar.

---

## 5. Render o Railway

Ambos detectan el `Dockerfile`, o pueden ejecutar Node directamente.

### Render

1. Crea una base de datos **PostgreSQL** y copia su *Internal Database URL*.
2. Crea un **Web Service** desde el repositorio:
   - Runtime: Node · Build command: `npm ci`
   - Start command: `node backend/src/scripts/db-setup.js --solo-si-vacia && npm start`
   - Health check path: `/api/salud`
3. Variables de entorno: `NODE_ENV=production`, `DATABASE_URL` (la URL interna), `JWT_SECRET`, `APP_URL=https://<tu-servicio>.onrender.com`, `TRUST_PROXY=true` y, si usas la URL externa de la base de datos, `DB_SSL=true`. Opcionales: `ANTHROPIC_API_KEY` y `SMTP_*`.

### Railway

1. Crea un proyecto con el servicio de **PostgreSQL** y un servicio desde el repositorio (usará el `Dockerfile`).
2. En el servicio de la aplicación define `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `JWT_SECRET`, `APP_URL` (el dominio que genera Railway) y `TRUST_PROXY=true`.
3. El `CMD` del `Dockerfile` instala la base de datos en el primer arranque.

En ambos servicios el puerto lo asigna la plataforma mediante `PORT`, que la aplicación ya respeta. La creación automática de la base de datos no aplica (ya existe); `db-setup` lo detecta y continúa.

---

## Lista de verificación para producción

- [ ] `NODE_ENV=production` y un `JWT_SECRET` aleatorio de al menos 32 caracteres (la aplicación no arranca sin él).
- [ ] `APP_URL` con el dominio público en `https://` (activa la cookie `Secure`, HSTS y `upgrade-insecure-requests`, y corrige los enlaces de los correos).
- [ ] HTTPS en el proxy y `TRUST_PROXY=true` para que los límites de tasa vean la IP real de cada estudiante.
- [ ] Usuario de PostgreSQL propio (sin permisos de superusuario) y la base de datos sin acceso desde Internet.
- [ ] SMTP configurado. Sin él, los enlaces de recuperación de contraseña solo quedan en el registro del servidor (en producción la API nunca los devuelve).
- [ ] **No** ejecutes `npm run db:demo` en producción: crea cuentas con contraseñas públicas. Si lo hiciste, elimina `demo@icfeslab.co` y `admin@icfeslab.co` o cámbiales la contraseña.
- [ ] Un administrador propio creado con `npm run admin:crear` y una contraseña fuerte.
- [ ] Fecha global del ICFES y límite diario de Vanty revisados en `/admin`.
- [ ] Contenido académico revisado por docentes (ver la nota en el README).
- [ ] `ANTHROPIC_API_KEY` guardada como secreto de la plataforma, nunca en el repositorio. Revisa las consideraciones de privacidad en [VANTY.md](VANTY.md#privacidad-y-seguridad).
- [ ] Copias de seguridad automáticas de la base de datos y una restauración de prueba.
- [ ] Monitoreo del endpoint `/api/salud` y de los registros del proceso.
- [ ] `npm audit` y actualización periódica de dependencias.

> **Varias instancias.** Los límites de tasa se guardan en memoria de cada proceso. Si ejecutas varias réplicas detrás de un balanceador, configura un almacén compartido (por ejemplo, Redis con `rate-limit-redis`) en `backend/src/middlewares/limites.js`.

---

## Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| `No se pudo conectar a PostgreSQL` al arrancar | El servicio de PostgreSQL no está en marcha o `DATABASE_URL` es incorrecta. Comprueba el usuario, la contraseña (codificada si tiene caracteres especiales), el puerto y el nombre de la base. |
| `password authentication failed for user "postgres"` | La contraseña de `DATABASE_URL` no coincide con la definida al instalar PostgreSQL. |
| `permission denied to create database` en `db:setup` | El usuario no tiene permiso `CREATEDB`. Crea la base a mano (`createdb -U postgres -E UTF8 -T template0 icfeslab`) y vuelve a ejecutar `npm run db:setup`. |
| `JWT_SECRET es obligatorio en producción…` | Define `JWT_SECRET` con 32 caracteres o más. |
| `DATABASE_URL no está definida` | Falta el archivo `.env` en la raíz del proyecto (copia `.env.example`). |
| `EADDRINUSE: address already in use :::3000` | Otro programa usa el puerto: cambia `PORT` en el `.env`. |
| Las tildes se ven mal (`MatemÃ¡ticas`) | La base de datos se creó con una codificación distinta de UTF-8. Recréala con `-E UTF8 -T template0` y reinstala con `npm run db:setup`. |
| La sesión se cierra cada vez que reinicio en desarrollo | No hay `JWT_SECRET` en el `.env` y se genera uno temporal en cada arranque. |
| No puedo iniciar sesión desde otro dispositivo de la red | Revisa que `APP_URL` use `http://` con la IP del servidor (si dice `https://` la cookie exige HTTPS) y que el firewall permita el puerto. |
| No llega el correo de recuperación | Revisa `SMTP_*` y los registros del servidor. En desarrollo sin SMTP, el enlace se imprime en la consola. |
| Vanty dice "Modo local" aunque configuré la clave | Reinicia el servidor tras editar el `.env` y revisa que no tenga espacios o comillas extra. La consola indica `Vanty: Claude (…)` cuando la clave está activa. |
| Vanty responde "La clave de la API de IA no es válida" | La clave fue revocada o está mal copiada; genera una nueva en console.anthropic.com. |
| Las respuestas de Vanty aparecen de golpe y no en streaming | Un proxy está almacenando la respuesta en búfer: en Nginx usa `proxy_buffering off` para `/api/vanty/` (ver 4.3). |
| `429 Demasiadas solicitudes` detrás de un proxy | Falta `TRUST_PROXY=true`: todos los estudiantes comparten la IP del proxy y agotan el límite. |
| PowerShell: "la ejecución de scripts está deshabilitada" | Usa `npm.cmd` en lugar de `npm`, o el Símbolo del sistema. |
