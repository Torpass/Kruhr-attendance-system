# Horarios · cómo se calculan las horas

Cada horario define cómo se clasifican los minutos de un turno: ordinarios, nocturnos ordinarios, extra diurna y extra nocturna. Un colaborador recibe su horario en el **contrato**. Cada turno se calcula con el horario del contrato vigente el día en que empieza.

Si el contrato no tiene horario, o el colaborador no tiene contrato, rige la **regla general**. Es la del enunciado de la prueba: 8 h ordinarias por turno, nocturna de 19:00 a 05:00, sin descanso descontado y alerta con más de 10 h extra en la semana.

El motor es `computeShift` y `summarizePeriod` en [`packages/core`](../packages/core/src). La política está en [`schedule.ts`](../packages/core/src/schedule.ts). Las funciones son puras y están probadas en `shift.spec.ts`, `period.spec.ts` y `schedule.spec.ts`.

## 1. Qué configura un horario

| Campo | Qué hace | Regla general |
| --- | --- | --- |
| **¿Cuándo empieza la hora extra?** | `duration`: pasadas N horas de turno. `schedule`: fuera de la jornada del día. | `duration` |
| Horas ordinarias por turno | Solo en `duration`. | 8 h |
| Jornada por día | Solo en `schedule`. Entrada y salida de lunes a domingo; un día sin jornada es libre. Si la salida es igual o anterior a la entrada, termina al día siguiente (p. ej. 22:00–06:00). | — |
| Descanso no pagado | Minutos que se descuentan de los turnos que duran **más** de "a partir de". | 0 min, a partir de 5 h |
| Ventana nocturna | Desde y hasta en hora local; puede cruzar la medianoche (19:00–05:00) o no (00:00–06:00). | 19:00–05:00 |
| Alerta semanal | Más de estas horas extra en una semana (lunes a domingo) muestran una alerta. No bloquea nada. | 10 h |

## 2. Algoritmo por turno

1. La entrada y la salida se pasan a hora de Caracas y se truncan al minuto. La **fecha del turno** es la de la entrada.
2. **Descanso:** si el turno dura más de "a partir de", se toma el descanso completo (o el turno entero, si es más corto).
3. **Tramos ordinario y extra:**
   - **`duration`:** el corte está en `entrada + horas ordinarias + descanso`. Antes del corte es ordinario; después, extra. El descanso corre el corte para que la hora de almuerzo no se cuente como extra.
   - **`schedule`:** se busca la jornada que corresponde al turno: la de su día o, si una jornada nocturna del día anterior lo cubre más, esa. Lo que cae dentro de la jornada es ordinario; lo de antes de la entrada o después de la salida, extra. En un día libre, **todo** el turno es extra.
4. Cada tramo se parte en las fronteras de la ventana nocturna. Cada minuto es nocturno o diurno según la hora local en que ocurrió.
5. **El descanso se descuenta** en este orden: ordinario diurno, ordinario nocturno, extra diurna, extra nocturna.
6. Resultado en minutos enteros: `worked` (duración menos descanso), `nightOrdinary`, `overtimeDay` y `overtimeNight`.

**Por período**, se suman los minutos de los turnos cuya fecha cae en el período y se redondea a 2 decimales **solo al final**. La alerta usa el umbral del horario vigente el lunes de cada semana.

## 3. Ejemplos

| Horario | Turno | Trabajadas | Nocturna ord. | Extra diurna | Extra nocturna |
| --- | --- | --- | --- | --- | --- |
| Regla general | Lun 06:00 → 16:00 | 10,00 | 0,00 | 2,00 | 0,00 |
| Regla general | Mar 14:00 → Mié 00:30 | 10,50 | 3,00 | 0,00 | 2,50 |
| Regla general | Jue 08:00 → 21:00 | 13,00 | 0,00 | 3,00 | 2,00 |
| Duración 8 h, descanso 60 min | Lun 09:00 → 18:00 | 8,00 | 0,00 | 0,00 | 0,00 |
| Jornada L–V 08:00–17:00, descanso 60 min | Lun 07:00 → 19:00 | 11,00 | 0,00 | 3,00 | 0,00 |
| Jornada L–V 08:00–17:00, descanso 60 min | Dom 09:00 → 13:00 (libre) | 4,00 | 0,00 | 4,00 | 0,00 |
| Jornada nocturna 22:00–06:00 | Lun 22:00 → Mar 07:00 | 9,00 | 7,00 | 1,00 | 0,00 |
| Duración 8 h, nocturna 18:00–06:00 | Lun 10:00 → 20:00 | 10,00 | 0,00 | 0,00 | 2,00 |

En la jornada de oficina, de 07:00 a 08:00 y de 17:00 a 19:00 hay 3 h de extra. La jornada 08:00–17:00 da 9 h menos 1 h de descanso, que son 8 h ordinarias.

## 4. Asignar y cambiar el horario

- **Al crear el contrato** se elige el horario, o la regla general.
- **Cambiar de horario** ("Cambiar horario" en la ficha del colaborador) cierra el contrato el día anterior a la fecha elegida y abre uno igual (estructura, salario y fin) con el horario nuevo, en una sola transacción (`POST …/contracts/:id/schedule`). Los días anteriores se siguen calculando con el horario que tenían.
- **Editar un horario** cambia el cálculo de todos los turnos de sus contratos, también hacia atrás. Los recibos de un lote guardan sus horas: no cambian hasta que el lote se recalcula, y un lote validado o pagado ya no se recalcula.
- Los horarios no se borran: se **desactivan**. Un horario inactivo sigue calculando los contratos que lo tienen, pero no se puede asignar en contratos nuevos.

## 5. Modelo de datos (migración `0005_work_schedules`)

```text
work_schedules  id, group_id, code, name, active, overtime_mode (duration|schedule), ordinary_minutes,
                days jsonb? (7 × {start, end} | null), break_minutes, break_after_minutes,
                night_start, night_end, weekly_overtime_alert_minutes
                UNIQUE (group_id, code) · CHECK de minutos, formato HH:MM y ventana nocturna no vacía
contracts       + schedule_id? → work_schedules   (null = regla general)
```

La API valida la política completa con `validatePolicy` de core: al crear, y al editar después de combinar los cambios con lo guardado.
