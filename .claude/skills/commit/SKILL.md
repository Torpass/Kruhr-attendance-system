---
name: commit
description: Crea ramas, commits y Pull Requests de Marcaje siguiendo la convención del repo (una rama y un PR por unidad de trabajo, ramas `<tipo>/<descripcion>`, mensajes y PRs `[TAG] scope: description` en inglés, con el porqué). Úsala cuando el usuario pida commitear, crear una rama, subir cambios o abrir un PR. Con el argumento `push` sube la rama y abre el PR.
---

# Ramas, commits y PRs · Marcaje

Convención para que cada cambio sea claro, trazable y auditable. Los **mensajes de commit, los nombres de rama y los títulos de PR van en inglés**.

## 1. Ramas

Formato: `<tipo>/<descripcion-en-kebab-case>`

- **Una rama por unidad de trabajo** (una feature, un fix, un ajuste de CI) y **un PR por rama**. Las ramas viven poco: se integran en días, no en semanas.
- Siempre parten de `main` actualizado (`git switch main && git pull`) y vuelven a `main` por Pull Request. Nunca se commitea directo a `main`.
- La descripción es corta (2–5 palabras), en inglés y en minúsculas.
- Si existe un issue de GitHub, va su número al inicio: `fix/23-safari-cookie`.

| Tipo | Uso |
| --- | --- |
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de errores |
| `refactor` | Reestructuración sin cambio funcional |
| `perf` | Mejoras de rendimiento |
| `test` | Solo pruebas |
| `docs` | Solo documentación |
| `style` | Formato o lint sin impacto funcional |
| `chore` | Mantenimiento: dependencias, configuración, housekeeping |
| `deploy` | CI/CD, Docker, Render, Vercel, scripts de despliegue |

Ejemplos: `feat/clock-in-out`, `fix/period-rounding`, `deploy/render-blueprint`, `docs/local-setup`.

## 2. Tags de commit

| Tag | Significado |
| --- | --- |
| `[FEAT]` | Crea algo que no existía o cambia el flujo funcional |
| `[IMP]` | Mejora incremental de algo existente, sin funcionalidad nueva |
| `[FIX]` | Corrección de un error |
| `[REF]` | Refactorización sin cambio funcional |
| `[PERF]` | Rendimiento |
| `[TEST]` | Pruebas |
| `[DOCS]` | Documentación |
| `[STYLE]` | Formato o lint |
| `[CHORE]` | Mantenimiento |
| `[DEPLOY]` | Despliegue y CI/CD |
| `[REV]` | Revierte un commit (indicar el hash en el cuerpo) |

**FEAT vs IMP:** FEAT crea algo que el usuario no podía hacer antes (requiere probar el flujo completo). IMP ajusta algo que ya existía (texto, validación, UX, un caso borde).

### Coherencia rama → commits

| Rama | Tags permitidos |
| --- | --- |
| `feat` | FEAT, IMP, REF, TEST, DOCS |
| `fix` | FIX, IMP, TEST |
| `refactor` | REF, STYLE, TEST |
| `perf` | PERF, IMP, TEST |
| `chore` | CHORE, IMP, STYLE, TEST |
| `deploy` | DEPLOY, CHORE, DOCS |
| `test` | TEST |
| `docs` | DOCS |
| `style` | STYLE |

Si una feature necesita dependencias, configuración o despliegue para funcionar, esos commits pueden ir en la misma rama con su propio tag (`CHORE`, `DEPLOY`). Si ese trabajo tiene sentido por sí solo, va en su propia rama.

## 3. Formato del mensaje

```text
[TAG] scope(s): short imperative description

Paragraph explaining WHY the change is made: the problem, the
context or the decision. It does not restate the diff.

- scope: what changes in this part and why, when the commit
  touches several scopes.

Tests: which tests were added or run.

References:
- https://github.com/Torpass/Kruhr-attendance-system/issues/N

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Reglas:

1. **Primera línea:** `[TAG] scope(s): description`.
   - La descripción va en inglés, en imperativo y en minúscula: *add*, *fix*, *remove*, *move*. Debe completar la frase "If applied, this commit will…".
   - Máximo **50 caracteres** en la descripción y 72 en la línea completa. Sin punto final.
2. **Alcances**, separados por coma si son varios: `api`, `web`, `core`, `contracts`, `db`, `ci`, `deploy`, `docs`, `repo`. Si el cambio está acotado a un módulo de Nest o a una ruta de Next, se puede ser más específico: `api/auth`, `web/rrhh`.
3. **Cuerpo** en inglés, opcional en cambios triviales y obligatorio en los demás. Envuelto a 72 columnas. Explica el **porqué**, no el qué.
4. **Varios alcances:** una viñeta por alcance, como en el ejemplo de abajo.
5. **`Tests:`** describe las pruebas nuevas o la verificación hecha. Se omite si no aplica (docs, style).
6. **`References:`** es opcional: issues, PRs, documentación externa.
7. **`Co-Authored-By:`** va solo si el cambio se hizo con ayuda de IA. Sirve para la bitácora de IA de la entrega.

### Ejemplo

```text
[FEAT] api, web: add temporary cookie-based login

We need to confirm that Next, NestJS and Supabase talk to each other
before defining the use cases. Login checks a single user defined in
environment variables until the users table exists.

- api: global JwtAuthGuard with @Public(), JWT session in an
  httpOnly cookie and a 5 attempts/minute limit on /auth/login.
- web: /login and /panel built on the Kru design system; proxy.ts
  only redirects when the cookie is missing, the API decides
  authorization.

Tests: AuthService unit tests and e2e for login → /me → logout and
for /api/health with the database down.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## 4. Pull Requests

- **Título:** el mismo formato que la primera línea de un commit, en inglés: `[TAG] scope(s): description`. El tag es el del cambio principal de la rama.
- **Descripción:** en inglés, siguiendo [`.github/pull_request_template.md`](../../../.github/pull_request_template.md):
  - **Why:** el problema o el objetivo.
  - **What changed:** una viñeta por alcance.
  - **How to test:** pasos reproducibles.
  - **Screenshots:** solo si hay cambios de UI, en escritorio y móvil.
  - **Checklist** y **References**.
- **Tamaño:** pequeño y de una sola preocupación. Como guía, menos de ~400 líneas cambiadas sin contar el lockfile ni el código generado. Si crece, se divide en varios PRs.
- **Borrador:** se abre como *Draft* mientras haya trabajo pendiente, y pasa a *Ready for review* cuando la CI está en verde.
- **Revisión:** antes de pedir revisión, el autor relee su propio diff en GitHub. Los cambios pedidos se agregan como commits nuevos; no se reescribe el historial de un PR que ya está en revisión.
- **Merge:** *Squash and merge*, con el título y la descripción del PR como mensaje. Así `main` queda con un commit por PR en el formato de la convención. La rama se borra después del merge.
- **IA:** un PR creado con ayuda de IA termina con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 5. Flujo al ejecutar la skill

1. **Revisa el estado:** `git status`, `git diff` y `git diff --staged`, y la rama actual.
2. **Rama:** si estás en `main`, crea la rama según §1 a partir del tipo de cambio y avisa el nombre. Nunca commitees directo a `main`. Si la rama actual es de otra unidad de trabajo, propón una rama nueva.
3. **Agrupa en commits lógicos:** un commit por preocupación. Si los cambios mezclan, por ejemplo, una feature y un ajuste de CI, propón separarlos. Agrega archivos por ruta (`git add <rutas>`), nunca `git add -A` a ciegas.
4. **Protege secretos:** no commitees `.env`, `.env.local`, credenciales ni URLs con contraseña. Comprueba con `git check-ignore` y revisa el diff staged. Si aparece un secreto, detente y avisa.
5. **Verifica el área tocada** antes de commitear:
   - API: `pnpm --filter @marcaje/api lint`, `test` y `test:e2e`.
   - Web: `pnpm --filter @marcaje/web lint` y `build`.

   Si algo falla, no commitees: informa la salida.
6. **Escribe el mensaje** según §3 y commitea con `git commit -F -` y un heredoc, para respetar los saltos de línea.
7. **Push y PR:** solo si se pasó el argumento `push` o el usuario lo pidió.
   - Sube la rama con `git push -u origin <rama>`.
   - Si la rama no tiene PR, ábrelo hacia `main` con `gh pr create --base main` según §4. Escribe el cuerpo con un heredoc a partir de la plantilla y agrega `--draft` si queda trabajo pendiente.
   - Si el PR ya existe, basta con el push. Actualiza la descripción si el alcance cambió.
8. **Resume:** rama, commits creados (hash + primera línea), estado del push y enlace al PR.
