# Marcaje · Kru

Registro de entrada y salida de colaboradores, con cálculo de horas por período para la nómina de Kru.
Prueba técnica: ver [`prueba-tecnica-kru-marcaje.md`](prueba-tecnica-kru-marcaje.md) · plan en [`docs/plan.md`](docs/plan.md) · UI en [`docs/design-system.md`](docs/design-system.md).

## Arquitectura

```text
Navegador ──► Vercel · Next.js 16 (apps/web)
                 │  rewrite /api/*  (mismo origen → cookie first-party)
                 ▼
              Render · NestJS 11 (apps/api, Docker)
                 │  Drizzle + postgres.js (Transaction pooler · 6543)
                 ▼
              Supabase · Postgres
```

- **Next.js** solo pinta pantallas. No tiene lógica de negocio ni acceso a la base de datos; `proxy.ts` solo redirige a `/login` si falta la cookie.
- **NestJS** decide la autorización (`JwtAuthGuard` global + `@Public()`) y, más adelante, el cálculo.
- **Supabase** se usa solo como Postgres gestionado: la Data API está deshabilitada y RLS está activo sin políticas.

## Estado actual

Ya está listo:
- **Esquema de la fase A** (empresas, usuarios, colaboradores, turnos y correcciones), con migraciones de Drizzle y seed.
- **Login real** para gestión (correo + contraseña) y para colaboradores (cédula + PIN; si trabajan en varias empresas, eligen en cuál marcar), con Argon2id y sesión JWT en una cookie `httpOnly`.
- **API de asistencia:** marcar entrada y salida, ver el día (dentro / sin marcar / sin salida), colaboradores, correcciones con motivo e historial, cálculo del período con alertas y exportación a CSV. Toda ruta de empresa valida rol y empresa (404 si no es tuya).
- **Motor de cálculo** en `packages/core`, con los dos ejemplos del enunciado entre sus tests.
- **Pantallas:**
  - colaborador (móvil): `/marcar` y `/marcar/historial`;
  - RRHH con selector de empresa: `/rrhh/<empresa>/hoy`, `colaboradores` (alta, ficha, corregir con motivo e historial) y `periodos` (semana, quincenas o rango, alertas y CSV);
  - `/registro` de empresas;
  - `/rrhh/<empresa>/equipo`: el admin gestiona a sus analistas;
  - `/admin`: el superusuario gestiona grupos, empresas y sus admins.
- **Nómina (fase B):**
  - catálogo por grupo: estructuras con reglas de tipos fijos, parámetros por fecha y entradas manuales, con una estructura de referencia "Quincenal VE" instalable;
  - contratos por colaborador;
  - lotes por empresa (calcular → validar → pagar) que toman las horas de Marcaje y bloquean las correcciones del período al validarse;
  - recibos imprimibles en `/marcar/recibos`.
- **PWA instalable** (`manifest.webmanifest`), que abre en `/panel` y manda a cada quien a su pantalla.
- **`/api/health`**, que hace `select 1` contra la base.

Los requerimientos, los roles, las vistas y el modelo de datos completo (incluida la nómina) están en [`docs/requisitos.md`](docs/requisitos.md).

## Correr en local

Requisitos: Node 24 (`.nvmrc`), Docker y pnpm vía corepack.

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm db:up
```

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
```

Edita `apps/api/.env`: al menos `JWT_SECRET` y las variables `SEED_*`, que son las claves de los usuarios de demo. Después crea las tablas y carga los datos de demo:

```bash
pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

El seed es idempotente: si lo vuelves a correr, actualiza las claves. Crea estos usuarios:

| Rol | Usuario | Clave |
| --- | --- | --- |
| superadmin | `SEED_SUPERADMIN_EMAIL` | `SEED_SUPERADMIN_PASSWORD` |
| admin de las empresas A Norte y A Sur | `admin@empresa-a.test` | `SEED_DEMO_PASSWORD` |
| analista de A Norte | `analista@empresa-a.test` | `SEED_DEMO_PASSWORD` |
| colaboradora de A Norte y A Sur (elige la empresa al entrar) | cédula `12345678` | PIN `SEED_DEMO_PIN` |
| admin de la empresa B | `admin@empresa-b.test` | `SEED_DEMO_PASSWORD` |

Si `DATABASE_URL` apunta a Supabase, `pnpm db:migrate` y `pnpm db:seed` actúan sobre producción. Para usar la base local, anteponles `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marcaje`: la variable de entorno tiene prioridad sobre `.env`.

Para cambiar el esquema, edita `apps/api/src/database/schema.ts` y genera la migración con `pnpm --filter @marcaje/api db:generate`.

- Web: http://localhost:3000 · API: http://localhost:4000/api/health

### Tests

```bash
pnpm test
```

```bash
pnpm db:up && pnpm --filter @marcaje/api test:e2e
```

Los e2e de integración usan la base `marcaje_test` del Postgres de docker compose; la crean y la migran solos. Nunca tocan la base de desarrollo ni Supabase. Para usar otra base, define `TEST_DATABASE_URL`; su nombre debe contener `test`.

## Despliegue

1. **Supabase** (proyecto `kru-attendance`, us-west-2, la misma región que Render `oregon`)
   - Project Settings → Data API: desactivar *Enable Data API*.
   - Activar *Enable automatic RLS*. Crea el event trigger `ensure_rls`.
   - Quitar los permisos automáticos de los roles públicos. Ya está aplicado como la migración `lock_down_public_default_privileges`; equivale a desmarcar *Automatically expose new tables*:
     ```sql
     alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
     alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
     alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
     ```
   - Connect → **Transaction pooler** (puerto **6543**): copiar la URL, añadir `?sslmode=require` y usarla como `DATABASE_URL`. Si la contraseña tiene caracteres especiales, hay que codificarlos (`@` → `%40`).
2. **Render** → New → Blueprint → este repo. Usa [`render.yaml`](render.yaml): completar `DATABASE_URL`. `JWT_SECRET` se genera solo. Las migraciones y el seed se corren desde una máquina local contra la `DATABASE_URL` de Supabase (`pnpm db:migrate`, `pnpm db:seed`), antes de desplegar el código que las necesita.
3. **Vercel** → importar el repo con **Root Directory `apps/web`**. Variables de entorno:
   - `API_URL` = URL pública de Render (sin `/api`).
   - `ENABLE_EXPERIMENTAL_COREPACK=1`, para que use el pnpm fijado en `packageManager`.
4. **GitHub** → Settings → Variables → `HEALTH_URL` = `https://<tu-app>.vercel.app/api/health`. El workflow [`keepalive`](.github/workflows/keepalive.yml) la llama cada 3 días para que Supabase no pause el proyecto.

> El plan gratuito de Render duerme el servicio tras 15 min sin tráfico; la primera petición tarda ~30–50 s.
