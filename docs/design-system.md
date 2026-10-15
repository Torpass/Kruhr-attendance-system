# Design system · Marcaje

Extraído de la landing de Kru (`kruhr.com/landing`), que está hecha con Astro + Tailwind y usa nombres de tokens en español (`kru`, `grafito`, `gris`, `hueso`, `borde`, `exito`, `rotulo`). Reutilizamos **los mismos nombres y valores** para que Marcaje se sienta parte del producto Kru.

La landing ya incluye un mockup del propio dashboard de Kru (sidebar + "Expediente del trabajador" + "Prenómina"). Ese mockup es la referencia visual principal para el panel de RRHH.

---

## 1. Marca

| Recurso | Fuente | Uso |
| --- | --- | --- |
| Logo horizontal | `https://kruhr.com/kru-logo.png` (1811×509) | Header, login. Alto `h-8` (32px) en header, `h-7` en footer. |
| Insignia (isotipo) | `https://kruhr.com/kru-insignia.png` (1080×1080) | Favicon, avatar de empresa en el selector, ícono PWA. `rounded-md`. |
| Favicons | `https://kruhr.com/favicon_{32,64,128}.png` | — |

Guardar copias en `apps/web/public/brand/`.

## 2. Color

La escala `kru` es exactamente la escala `violet` de Tailwind. `grafito`, `gris`, `hueso` y `borde` son pasos de la escala `gray`.

### Marca (`kru`)
| Token | Hex | Uso observado |
| --- | --- | --- |
| `kru-50` | `#F5F3FF` | Fondo de cards destacadas (neto a pagar, total del período) |
| `kru-100` | `#EDE9FE` | Fondo de avatares, badges de marca, borde de cards destacadas |
| `kru-200` | `#DDD6FE` | Bordes suaves, sombras |
| `kru-300` | `#C4B5FD` | Borde en hover |
| `kru-400` | `#A78BFA` | Texto acento sobre fondo oscuro |
| `kru-500` | `#8B5CF6` | Bordes activos |
| `kru-600` | `#7C3AED` | **Primario**: botones, íconos, barra de progreso, caret |
| `kru-700` | `#6D28D9` | Hover de links |
| `kru-800` | `#5B21B6` | **Hover del primario**, texto sobre `kru-100`, ítem activo del sidebar |
| `kru-900` | `#4C1D95` | Texto de énfasis |

### Neutros
| Token | Hex | Uso |
| --- | --- | --- |
| `grafito` | `#111827` | Texto principal, títulos, fondo de la sección oscura |
| `grafito-medio` | `#1F2937` | Superficie sobre fondo oscuro |
| `grafito-linea` | `#374151` | Bordes sobre fondo oscuro |
| `grafito-sobre` | `#D1D5DB` | Texto secundario sobre fondo oscuro |
| `gris` | `#4B5563` | Texto secundario, rótulos |
| `gris-claro` | `#9CA3AF` | Íconos inactivos, placeholders |
| `borde` | `#E5E7EB` | Bordes de cards, divisores, header |
| `borde-fuerte` | `#D1D5DB` | Bordes de inputs |
| `hueso` | `#F3F4F6` | Fondo de secciones alternas, sidebar, cajas internas (`hueso/60`) |
| `white` | `#FFFFFF` | Superficie de cards y fondo base |

### Estado
La landing solo define `exito`. Completamos `alerta` y `error` con la misma lógica (paso 600 / 100 / 700 de Tailwind) porque Marcaje los necesita.

| Token | Hex | Uso en Marcaje |
| --- | --- | --- |
| `exito` | `#16A34A` | Punto "dentro" / en línea |
| `exito-fondo` | `#DCFCE7` | Badge "Dentro", "Completo" |
| `exito-texto` | `#15803D` | Texto del badge |
| `alerta` *(nuevo)* | `#D97706` | Ícono de alerta de >10 h extra |
| `alerta-fondo` *(nuevo)* | `#FEF3C7` | Badge "Sin salida", "Corregido" |
| `alerta-texto` *(nuevo)* | `#B45309` | Texto del badge |
| `error` *(nuevo)* | `#DC2626` | Validaciones |
| `error-fondo` *(nuevo)* | `#FEE2E2` | Badge "No marcó" |
| `error-texto` *(nuevo)* | `#B91C1C` | Texto del badge |

## 3. Tipografía

- **Familia:** `Inter, system-ui, sans-serif`, pesos 400/500/600/700/800, cargada con `next/font/google` (self-hosted, sin parpadeo).
- **Números:** siempre `tabular-nums` (horas, montos, cédulas).
- **Formato numérico en UI:** `es-VE` → `10,50`. En el CSV se usa punto (`10.50`) porque lo exige el motor de nómina.

| Rol | Clase / valores |
| --- | --- |
| Display (H1) | `font-extrabold text-[2rem] sm:text-[2.5rem] lg:text-[3rem] leading-[1.06] tracking-[-0.03em] text-grafito` |
| Título de sección (H2) | `font-bold text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.025em]` |
| Título de card (H3) | `font-semibold text-base sm:text-lg leading-snug` |
| Cifra grande (KPI) | `text-[1.75rem] leading-none font-bold tabular-nums tracking-[-0.02em]` |
| Cuerpo | `text-base leading-relaxed text-gris` |
| Cuerpo pequeño | `text-[13px] text-gris` / `text-sm font-medium` |
| **Rótulo** | `.rotulo` = `11px / 16px, 600, uppercase, letter-spacing .06em`. Se usa para etiquetas de campo ("FECHA DE INGRESO"), encabezados de tabla y badges. |

## 4. Forma, sombra y movimiento

| Token | Valor | Uso |
| --- | --- | --- |
| `rounded-lg` | 8px | Botones, ítems de sidebar, inputs |
| `rounded-xl` | 12px | Cards internas, filas de lista |
| `rounded-2xl` | 16px | Contenedor principal / card grande |
| `rounded-full` | — | Badges, avatares, barra de progreso |
| `shadow-kru` | `0 1px 2px rgb(17 24 39/.04), 0 4px 6px -4px rgb(221 214 254/.9)` | Botón primario, ítem activo |
| `shadow-kru-md` | `0 4px 6px -4px rgb(196 181 253/.55), 0 10px 15px -3px rgb(221 214 254/.7)` | Cards elevadas |
| `shadow-kru-lg` | `0 10px 15px -3px rgb(196 181 253/.45), 0 25px 50px -12px rgb(167 139 250/.28)` | Contenedor principal del dashboard |
| Transición | `transition-colors 150ms cubic-bezier(.4,0,.2,1)` | Hover |
| Revelar | `opacity 0→1, translateY 14px→0, .62s cubic-bezier(.16,1,.3,1)` | Entrada de secciones (respetar `prefers-reduced-motion`) |

Las sombras son **teñidas de violeta**, no grises. Es un rasgo distintivo de la marca.

## 5. Componentes (recetas tomadas de la landing)

```text
Botón primario      rounded-lg bg-kru-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-kru-800 transition-colors
Botón primario XL   rounded-lg bg-kru-600 px-6 py-4 text-base font-semibold text-white shadow-kru hover:bg-kru-800   (CTA "Marcar entrada" en móvil, w-full)
Botón ícono         w-10 h-10 rounded-lg border border-borde text-gris hover:text-kru-700 hover:border-kru-300
Botón secundario*   rounded-lg border border-borde-fuerte bg-white px-4 py-2.5 text-sm font-semibold text-grafito hover:border-kru-300
Ítem de sidebar     rounded-lg px-3 py-2 text-sm font-medium text-gris hover:text-grafito
                    activo: bg-white text-kru-800 shadow-kru (ícono text-kru-600)
Card contenedor     rounded-2xl border border-borde bg-white shadow-kru-lg overflow-hidden
Card simple         rounded-2xl border border-borde bg-white p-4 sm:p-6
Card interna        rounded-xl border border-borde bg-hueso/60 p-3.5
Card destacada      rounded-xl border border-kru-100 bg-kru-50 p-3.5   (rótulo text-kru-800 + cifra grande)
KPI                 rounded-xl border border-borde p-3.5 → rótulo text-gris + cifra
Fila de lista       flex items-center gap-3 rounded-xl border border-borde px-3.5 py-2.5
Badge marca         rotulo rounded-full bg-kru-100 text-kru-800 px-2.5 py-1
Badge éxito         rotulo rounded-full bg-exito-fondo text-exito-texto px-2.5 py-1
Chip informativo    inline-flex items-center gap-2 rounded-full border border-borde bg-hueso/60 px-2.5 py-1 text-[12px] font-medium text-gris
Avatar (iniciales)  grid place-items-center rounded-full bg-kru-100 text-kru-800 font-semibold   (w-7 = 11px · w-11 = text-sm)
Punto de estado     w-1.5 h-1.5 rounded-full bg-exito
Barra de progreso   track: h-1.5 rounded-full bg-borde · fill: bg-kru-600
Campo (label+valor) rótulo text-gris arriba, valor text-sm font-medium text-grafito, separados por border-b border-borde
Header              sticky top-0 bg-white border-b border-borde, logo h-8 + botón primario
Sección oscura      bg-grafito, títulos text-white, cuerpo text-grafito-sobre, bordes grafito-linea
Input*              rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm focus:border-kru-500 focus:ring-4 focus:ring-kru-100
```

`*` = no aparece en la landing. Lo derivamos con los mismos tokens.

## 6. Tono de voz

- Español venezolano y directo. Se tutea ("Te respondemos…", "Kru lo hace por ti").
- Usa los términos del dominio: quincena, prenómina, cédula, colaborador/trabajador, RRHH.
- Los montos y las horas llevan unidad en el rótulo ("TOTAL DEL PERÍODO · BS.", "HORAS EXTRA · H").

## 7. Mapeo a pantallas de Marcaje

| Pantalla | Patrón de la landing |
| --- | --- |
| Shell del panel RRHH | Card contenedor + sidebar `hueso` con ítems (Hoy · Colaboradores · Períodos) + usuario abajo (avatar + nombre + rol) |
| Selector de empresa | Header del mockup: insignia + "Distribuidora Caracas, C.A." + chevron |
| Hoy (estado del día) | KPIs (Dentro / No han marcado / Sin salida) + filas de lista con avatar, badge de estado y hora |
| Ficha del colaborador | "Expediente del trabajador": avatar grande, nombre, cargo, badge, grilla de campos con rótulo |
| Corrección de marcaje | Card simple con inputs + textarea "Motivo" obligatorio; botón primario |
| Período / cálculo | Card destacada con el total + tabla con encabezados `.rotulo`, cifras `tabular-nums`, badge de alerta >10 h extra |
| Exportar | Fila de lista tipo "Archivo TXT del banco · Listo" → "CSV del período · Descargar" |
| App del colaborador (móvil) | Pantalla única: hora grande, estado (punto + badge), botón primario XL a ancho completo |

## 8. Implementación (Tailwind v4)

`apps/web/app/globals.css` (Inter se carga con `next/font/google` en `app/layout.tsx` y expone la variable `--font-inter`):

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-inter), "Inter", system-ui, sans-serif;

  --color-kru-50: #f5f3ff;  --color-kru-100: #ede9fe; --color-kru-200: #ddd6fe;
  --color-kru-300: #c4b5fd; --color-kru-400: #a78bfa; --color-kru-500: #8b5cf6;
  --color-kru-600: #7c3aed; --color-kru-700: #6d28d9; --color-kru-800: #5b21b6;
  --color-kru-900: #4c1d95;

  --color-grafito: #111827; --color-grafito-medio: #1f2937;
  --color-grafito-linea: #374151; --color-grafito-sobre: #d1d5db;
  --color-gris: #4b5563; --color-gris-claro: #9ca3af;
  --color-borde: #e5e7eb; --color-borde-fuerte: #d1d5db;
  --color-hueso: #f3f4f6;

  --color-exito: #16a34a;  --color-exito-fondo: #dcfce7;  --color-exito-texto: #15803d;
  --color-alerta: #d97706; --color-alerta-fondo: #fef3c7; --color-alerta-texto: #b45309;
  --color-error: #dc2626;  --color-error-fondo: #fee2e2;  --color-error-texto: #b91c1c;

  --shadow-kru: 0 1px 2px 0 rgb(17 24 39 / .04), 0 4px 6px -4px rgb(221 214 254 / .9);
  --shadow-kru-md: 0 4px 6px -4px rgb(196 181 253 / .55), 0 10px 15px -3px rgb(221 214 254 / .7);
  --shadow-kru-lg: 0 10px 15px -3px rgb(196 181 253 / .45), 0 25px 50px -12px rgb(167 139 250 / .28);
}

@utility rotulo {
  font-size: 11px; line-height: 16px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
}

html { caret-color: var(--color-kru-600); }
```

Componentes base en `apps/web/components/ui/`: `Button`, `Card`, `Badge`, `Avatar`, `Field`, `Input`, `Textarea`, `Stat`, `ListRow`, `Sidebar`, `Table`, `ProgressBar`. Cada uno es una variante tipada (`cva` o mapas de clases), sin una librería de UI encima.
