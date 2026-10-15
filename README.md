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

Esqueleto funcional: login provisional contra un usuario definido por variables de entorno (`DEMO_EMAIL` / `DEMO_PASSWORD`), sesión JWT en cookie `httpOnly`, `/api/health` con `select 1` a la base y un panel que muestra la sesión y el estado de la API y la base. Todavía no hay tablas: se agregan al definir los casos de uso.

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

Edita `apps/api/.env` (al menos `JWT_SECRET` y `DEMO_PASSWORD`) y luego:

```bash
pnpm dev
```

- Web: http://localhost:3000 · API: http://localhost:4000/api/health

### Tests

```bash
pnpm test
```

```bash
pnpm --filter @marcaje/api test:e2e
```

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
2. **Render** → New → Blueprint → este repo. Usa [`render.yaml`](render.yaml): completar `DATABASE_URL`, `DEMO_EMAIL` y `DEMO_PASSWORD`. `JWT_SECRET` se genera solo.
3. **Vercel** → importar el repo con **Root Directory `apps/web`**. Variables de entorno:
   - `API_URL` = URL pública de Render (sin `/api`).
   - `ENABLE_EXPERIMENTAL_COREPACK=1`, para que use el pnpm fijado en `packageManager`.
4. **GitHub** → Settings → Variables → `HEALTH_URL` = `https://<tu-app>.vercel.app/api/health`. El workflow [`keepalive`](.github/workflows/keepalive.yml) la llama cada 3 días para que Supabase no pause el proyecto.

> El plan gratuito de Render duerme el servicio tras 15 min sin tráfico; la primera petición tarda ~30–50 s.
