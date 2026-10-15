# Requerimientos funcionales · Marcaje

Alcance, roles, casos de uso, vistas, motor de cálculo y modelo de datos. Complementa a [`plan.md`](plan.md), que cubre el stack y la arquitectura, y se basa en el [enunciado](../prueba-tecnica-kru-marcaje.md).

**El sistema se construye en dos fases:**
- **Fase A (la prueba):** marcar, ver el día, corregir, calcular el período y exportar el CSV.
- **Fase B (nómina):** estructuras salariales, reglas, lotes de recibos y recibos de pago, al estilo de Odoo.

El esquema se diseñó completo desde el inicio, pero solo la fase A está migrada.

---

## 1. Referencias

### Odoo 19 (`hr_payroll`, `hr_work_entry`)

| Concepto de Odoo | En Marcaje |
| --- | --- |
| La estructura (`hr.payroll.structure`) agrupa reglas (`hr.salary.rule`) ordenadas por `sequence` | Igual |
| Cada regla tiene una categoría (`hr.salary.rule.category`). Las categorías forman un árbol y su total sube al padre | **Sin categorías.** Una regla suma otras reglas por su código, y el recibo separa asignaciones de deducciones por el signo |
| El total de una línea es `monto × cantidad × tasa / 100` | Igual |
| Una regla lee el resultado de una regla anterior por su `code` | Igual |
| Los "worked days" agrupan las horas por tipo de entrada de trabajo | Cuatro códigos fijos derivados de los turnos (§4.2) |
| Las entradas manuales (`hr.payslip.input`) se indexan por código | `payslip_inputs` |
| Los parámetros (`hr.rule.parameter`) tienen valores por fecha (`date_from`) | `payroll_parameter_values` |
| El lote (`hr.payslip.run`) pasa por borrador → calculado → validado → pagado | `payslip_runs.state` |
| El contrato (`hr.version`) guarda el salario, la estructura y las fechas | `contracts` |
| Las reglas se escriben en Python (`amount_python_compute`) | **Tipos fijos, sin fórmulas libres** (decisión del usuario, §4.3) |
| Se guardan las entradas de trabajo (`hr.work.entry`) con detección de conflictos | **No se guardan.** Las horas se derivan de `shifts` con el motor puro |

### Nómina venezolana de Binaural (`binaural_hr_payroll*`)

- **Cómo llegan las horas:** las horas extra y el bono nocturno entran a la nómina como *inputs* (HED, HEN, BN), no como entradas de trabajo.
- **Fórmulas de referencia:**

  | Concepto | Cálculo |
  | --- | --- |
  | Salario diario | mensual / 30 |
  | Hora | diario / 8 |
  | Horas extra diurnas (HED) | hora × 1,5 |
  | Horas extra nocturnas (HEN) | hora × 1,95 |
  | IVSS (empleado) | salario semanal (mensual × 12 / 52, con tope) × lunes del período × 4 % |
  | RPE | igual que el IVSS, con 0,5 % |
  | FAOV | 1 % del devengado |

- **El bono nocturno de Binaural paga el 130 % del salario diario.** Parece un error, así que Marcaje usa un recargo del 30 % sobre la hora.
- **Recibo:** Concepto | Cantidad | Asignaciones | Deducciones, y debajo el neto a pagar. Las líneas positivas son asignaciones y las negativas, deducciones.

> Las tasas son **de referencia**: se toman de Binaural y no constituyen asesoría legal. Cada empresa las ajusta en sus reglas.

### Asistencias de Cadipa: errores que evitamos

| Cadipa | Marcaje |
| --- | --- |
| Si falta la salida, la inventa (entrada + 1 min) y no lo indica | El turno queda abierto y aparece como "sin salida". No se calcula hasta que RRHH lo corrige |
| Corta los días en UTC | Todos los cortes se hacen en `America/Caracas` |
| Clasifica la hora extra nocturna por la hora de inicio | Cada tramo se divide en las fronteras de 19:00 y 05:00 |
| Corrige sin pedir motivo | El motivo es obligatorio (`CHECK` en la base) y se guardan el antes y el después |
| Valida "un turno abierto" y "sin solapes" solo en Python | Lo garantiza la base: índice único parcial y `EXCLUDE USING gist` |

---

## 2. Roles

| Rol | Alcance | Puede |
| --- | --- | --- |
| `superadmin` | Todo el sistema | Crear y gestionar grupos y empresas, crear usuarios de cualquier rol y entrar a cualquier empresa |
| `admin` | Las N empresas asignadas, todas de **un** grupo | Todo lo del analista. Además, gestionar admins y analistas de su grupo, desactivar personas y ver KPIs profundos |
| `analyst` | Las N empresas asignadas, todas de **un** grupo | Dar de alta **solo colaboradores**, ver el día, corregir marcajes, calcular el período y exportar el CSV, gestionar estructuras, reglas, parámetros y entradas, generar, validar y pagar la nómina, y ver KPIs básicos |
| `employee` | Él mismo, en **una** empresa | Marcar, ver su historial y ver sus recibos |

**Reglas de acceso**
- **Jerarquía fija de dos niveles.** Un grupo (la empresa padre) tiene una o más empresas (sub-empresas).
- **Filtro por empresa.** Toda consulta de datos lleva un `company_id`, y ese id debe estar en las `companyIds` de la sesión (el superadmin las ve todas). Si el recurso es de otra empresa, la API responde **404** y no 403.
- **Catálogo de nómina por grupo.** Estructuras, reglas, parámetros y tipos de entrada son del **grupo**: los comparten sus empresas y los edita cualquier admin o analista del grupo.
- **Sesión siempre vigente.** La sesión se resuelve contra la base en cada request. Si se desactiva a una persona o a una empresa, o se le quita una empresa a alguien, el cambio aplica de inmediato.

---

## 3. Casos de uso y vistas

### Fase A: la prueba

| Ruta | Rol | Casos de uso |
| --- | --- | --- |
| `/registro` | público | Una empresa se registra: crea el grupo, su primera empresa y su admin |
| `/login` | público | **Colaborador:** cédula + PIN; si trabaja en varias empresas, elige en cuál va a marcar. **Gestión:** correo + contraseña |
| `/marcar` | employee | Marcar entrada o salida (la hora la pone el servidor) y ver los turnos de hoy |
| `/marcar/historial` | employee | Su historial de turnos |
| `/rrhh/hoy` | admin, analyst | KPIs del día y tres listas: **Dentro**, **No ha marcado** y **Sin salida**. Selector de empresa |
| `/rrhh/colaboradores` | admin, analyst | Lista de colaboradores, alta (nombre, cédula y PIN inicial) y desactivación |
| `/rrhh/colaboradores/:id` | admin, analyst | Ficha con sus turnos. Corregir un turno o crear uno manual, siempre con motivo |
| `/rrhh/periodos` | admin, analyst | Elegir semana, 1.ª o 2.ª quincena, o un rango. Tabla de horas con alerta si hay más de 10 h extra en una semana. Exportar CSV |
| `/rrhh/equipo` | admin | Alta de analistas y admins, y asignación de empresas del grupo |
| `/admin/empresas` | superadmin | Grupos, empresas y usuarios de todo el sistema |

### Fase B: nómina

| Ruta | Rol | Casos de uso |
| --- | --- | --- |
| `/rrhh/nomina/estructuras` | admin, analyst | Estructuras y sus reglas ordenadas |
| `/rrhh/nomina/parametros` | admin, analyst | Salario mínimo y topes, con valores por fecha |
| `/rrhh/colaboradores/:id/contrato` | admin, analyst | Contratos: salario, estructura y vigencia |
| `/rrhh/nomina/lotes` | admin, analyst | Crear un lote (empresa + estructura + período) → generar los recibos (las horas salen del motor de asistencia) → cargar entradas → calcular → validar → pagar |
| `/marcar/recibos` | employee | Sus recibos validados o pagados |
| `/rrhh/kpis` | admin | Costo de nómina, horas extra por empresa y alertas |

Cuando un lote está `validated` o `paid`, la API bloquea las correcciones de turnos de esa empresa dentro de ese rango.

---

## 4. Motor de cálculo (`packages/core`, funciones puras)

### 4.1 Asistencia (fase A)

El algoritmo está en [`plan.md` §6](plan.md#6-motor-de-cálculo-packagescore), verificado a mano contra los dos ejemplos del enunciado.

| Función | Qué hace |
| --- | --- |
| `calcularTurno` | Devuelve los minutos `ordinarios`, `nocturnaOrdinaria`, `extraDiurna` y `extraNocturna` |
| `calcularPeriodo` | Suma los minutos y redondea a 2 decimales solo al final |
| `alertasSemanales` | Marca las semanas con más de 600 min de extra |
| `aCSV` | Arma el CSV con las columnas del enunciado |

### 4.2 Horas trabajadas que ve la nómina

| Código | Origen | Novedad del CSV |
| --- | --- | --- |
| `WORK` | Minutos ordinarios | — |
| `NIGHT` | Nocturna ordinaria | `nightShiftHours` |
| `OT_DAY` | Extra diurna | `overtimeDayHours` |
| `OT_NIGHT` | Extra nocturna | `overtimeNightHours` |

### 4.3 Reglas salariales con tipos fijos (fase B)

`calcularRecibo(contrato, estructura, horas, entradas, parámetros, período)` recorre las reglas en orden de `sequence`. Cada regla se arma combinando estos campos:

| Campo | Valores |
| --- | --- |
| `condition` | `always` · `nonzero_quantity` (se omite si la cantidad es 0) |
| `quantity_source` | `one` · `worked_hours` + código (§4.2) · `input` + código · `period_days` · `mondays` |
| `amount_type` | `fixed` (`amount_fix`) · `monthly_wage` · `weekly_wage` (mensual × 12 / 52) · `daily_wage` (mensual / 30) · `hourly_wage` (diario / 8) · `percentage_of` (suma de los totales de las reglas anteriores listadas en `base_codes`) |
| `amount_cap_param` | Opcional: el monto no puede pasar del valor vigente de ese parámetro |
| `rate` | Porcentaje con signo: 150 para horas extra, −4 para el IVSS |

- **Total de la línea:** `round2(monto × cantidad × rate / 100)`.
- **Acumulación:** el total queda disponible por su código para las reglas siguientes. No hay categorías.
- **Recibo:** las líneas positivas son asignaciones y las negativas, deducciones. Las reglas de totales (GROSS, NET) y los aportes patronales llevan `appears_on_payslip = false`.

**Estructura de ejemplo "Quincenal VE" para el seed:**

| Código | Cálculo |
| --- | --- |
| BASIC | `daily_wage` × `period_days` × 100 % |
| HED | `hourly_wage` × `OT_DAY` × 150 % |
| HEN | `hourly_wage` × `OT_NIGHT` × 195 % |
| BN | `hourly_wage` × `NIGHT` × 30 % |
| GROSS | `percentage_of` [BASIC, HED, HEN, BN] × 100 % |
| IVSS | `weekly_wage` (tope `TOPE_IVSS`) × `mondays` × −4 % |
| RPE | `weekly_wage` (tope `TOPE_IVSS`) × `mondays` × −0,5 % |
| FAOV | `percentage_of` [GROSS] × −1 % |
| NET | `percentage_of` [GROSS, IVSS, RPE, FAOV] × 100 % |

---

## 5. Modelo de datos

**Convenciones**
- Las horas se guardan como `timestamptz` en UTC.
- Los montos se guardan como `numeric(14,2)`.
- Las columnas van en `snake_case`.
- El esquema vive en [`apps/api/src/database/schema.ts`](../apps/api/src/database/schema.ts) y las migraciones en [`apps/api/drizzle/`](../apps/api/drizzle).

### 5.1 Fase A (migraciones `0000_init` y `0001_shifts_no_overlap`, aplicadas)

```text
company_groups    id, name, slug UNIQUE, currency_code ('VES'), created_at
companies         id, group_id → company_groups, name, slug UNIQUE, rif?, active, created_at
                  UNIQUE (id, group_id)                      ← destino de FKs compuestas
users             id, role (superadmin|admin|analyst), group_id?, name, email UNIQUE, password_hash, active
                  CHECK (role = 'superadmin') = (group_id IS NULL) · CHECK email en minúsculas
user_companies    (user_id, company_id) PK, group_id
                  FK (user_id, group_id) → users · FK (company_id, group_id) → companies   ← mismo grupo
employees         id, company_id → companies, cedula, name, pin_hash, active, hired_on?
                  UNIQUE (company_id, cedula) · CHECK cédula de 5 a 10 dígitos
shifts            id, company_id, employee_id, clock_in, clock_out?, created_at, updated_at
                  FK (employee_id, company_id) → employees    ← el turno es de la empresa del colaborador
                  CHECK clock_out > clock_in
                  UNIQUE parcial (employee_id) WHERE clock_out IS NULL
                  EXCLUDE gist (employee_id =, tstzrange(clock_in, clock_out) &&)
shift_corrections id, shift_id, company_id, corrected_by → users, reason, before?, after, created_at
                  FK (shift_id, company_id) → shifts · CHECK length(trim(reason)) >= 5
```

**Decisiones**
- **Los colaboradores están separados de los usuarios de gestión**, como `hr.employee` y `res.users` en Odoo. Son dos formas de entrar: los colaboradores no tienen correo y entran con cédula + PIN.
- **Una persona puede trabajar en varias empresas:** tiene un registro de colaborador en cada una (`UNIQUE (company_id, cedula)`). Al entrar con cédula + PIN elige en cuál marca, y la sesión queda atada a ese registro. La lista de empresas solo se muestra después de validar el PIN, para no revelar quiénes son los clientes.
- **Las FKs compuestas impiden mezclar datos entre empresas o grupos desde la base**, no solo desde la API.
- **`btree_gist`** se instala en el esquema `extensions`, que es la convención de Supabase.
- **El superadmin no tiene filas en `user_companies`:** accede a todo.

### 5.2 Fase B (migración pendiente, se escribe al empezar la nómina)

```text
payroll_parameters        id, group_id, code, name                     UNIQUE (group_id, code)
payroll_parameter_values  parameter_id, date_from, value               PK (parameter_id, date_from)
salary_structures         id, group_id, code, name, schedule_pay (weekly|semi_monthly|monthly), active
salary_rules              id, structure_id, code, name, sequence, appears_on_payslip,
                          condition, quantity_source, quantity_code?, amount_type, amount_fix?,
                          base_codes text[]?, amount_cap_param?, rate, active   UNIQUE (structure_id, code)
input_types               id, group_id, code, name                     UNIQUE (group_id, code)
contracts                 id, employee_id, structure_id, wage, date_start, date_end?
                          EXCLUDE gist (employee_id =, daterange &&)   ← un contrato vigente a la vez
payslip_runs              id, company_id, structure_id, date_from, date_to,
                          state (draft|computed|validated|paid|cancelled), created_by
payslips                  id, run_id, employee_id, contract_id, state, gross, net, computed_at
payslip_worked_hours      payslip_id, code, minutes                   ← copia de las horas al momento del cálculo
payslip_inputs            payslip_id, input_type_id, amount
payslip_lines             payslip_id, rule_id, code, name, sequence, quantity, amount, rate, total, appears_on_payslip
```

Las líneas copian el código y el nombre de la regla. Así el recibo histórico no cambia si después se edita la regla, y no hace falta el versionado de reglas que tiene Binaural.

---

## 6. Autenticación

| Endpoint | Quién | Credenciales |
| --- | --- | --- |
| `POST /api/auth/staff/login` | superadmin, admin, analista | correo + contraseña |
| `POST /api/auth/employee/login` | colaborador | cédula (acepta `V-12.345.678`) + PIN de 4 a 6 dígitos. Si el PIN coincide en varias empresas, responde `{ companies }` sin abrir sesión, y el cliente repite con `companyId` |
| `POST /api/auth/logout` · `GET /api/auth/me` | sesión | cookie `httpOnly` |

- **Hash:** contraseñas y PIN usan Argon2id con los parámetros de OWASP. Si la cuenta no existe, igual se verifica contra un hash de relleno, así el tiempo de respuesta no revela qué cuentas existen.
- **JWT:** solo lleva `{sub, kind}`. El rol, el grupo y las empresas se leen de la base en cada request.
- **Límite de intentos:**
  - 30 por minuto por IP: un turno completo puede entrar al mismo tiempo desde el Wi-Fi de la empresa.
  - 5 por minuto **por cuenta** (correo, o cédula normalizada a dígitos): frena la fuerza bruta del PIN desde muchas IPs.
