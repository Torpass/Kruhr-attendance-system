# Prueba técnica Kru · Marcaje

---

## Contexto

Kru es una plataforma de recursos humanos y nómina para empresas en Venezuela. Muchos de nuestros clientes pagan horas extra y horas nocturnas, y hoy esas horas las cuenta alguien a mano a partir de hojas de papel o de un reloj biométrico.

Queremos ver cómo construirías **Marcaje**: una aplicación donde cada colaborador registra su entrada y su salida, y Recursos Humanos obtiene las horas de cada período listas para la nómina.

Te pedimos un producto completo y utilizable: **desplegado, con backend, cliente y base de datos**. Puedes y debes usar herramientas de IA (Claude Code, Cursor, Copilot, ChatGPT o la que prefieras). Nos interesa tanto lo que construyas como las decisiones que tomes y cómo trabajas con la IA.

---

## Lo que tiene que hacer

1. **Empresas y usuarios.** Una empresa se registra y su administrador (RRHH) da de alta a sus colaboradores con nombre y cédula.
2. **Marcar.** El colaborador registra su entrada y su salida desde el celular.
3. **Ver el día.** RRHH ve quién está dentro, quién no ha marcado y quién marcó entrada pero no salida.
4. **Corregir.** RRHH puede corregir un marcaje indicando un motivo, que es obligatorio.
5. **Calcular el período.** Para una semana o una quincena, calcula las horas de cada colaborador según las reglas de abajo.
6. **Exportar.** Genera un CSV del período con una fila por colaborador.

---

## Reglas de cálculo

Están simplificadas a propósito: no hace falta investigar la ley.

- Todo se interpreta en la hora de Caracas (`America/Caracas`, UTC−4).
- Un turno es una entrada y su salida. Pertenece al día en que empieza, aunque termine al día siguiente.
- Las primeras 8 horas de un turno son ordinarias. Lo que pase de 8 horas es hora extra.
- Una hora es nocturna si cae entre las 19:00 y las 05:00.
- Las horas extra son las últimas del turno y se clasifican en diurnas o nocturnas según la hora en que ocurrieron.
- Las horas nocturnas ordinarias son las que caen entre las 19:00 y las 05:00 dentro de las primeras 8 horas del turno.
- Se suman minutos y se redondea a 2 decimales al final del período, no turno por turno.
- Si un colaborador pasa de 10 horas extra en una semana, RRHH ve una alerta. La alerta no bloquea nada.

### Ejemplos

| Turno                  | Total | Extra diurna | Extra nocturna | Nocturna ordinaria |
| ---------------------- | ----: | -----------: | -------------: | -----------------: |
| Lun 06:00 → 16:00      | 10,00 |         2,00 |           0,00 |               0,00 |
| Mar 14:00 → Mié 00:30  | 10,50 |         0,00 |           2,50 |               3,00 |

---

## Formato del CSV

Separado por punto y coma, con una fila por colaborador. Las columnas de horas usan los nombres de las novedades que recibe el motor de nómina de Kru.

```csv
cedula;nombre;periodo_desde;periodo_hasta;overtimeDayHours;overtimeNightHours;nightShiftHours
12345678;Ana Pérez;2026-10-05;2026-10-11;2.00;2.50;3.00
```

---

## Restricciones

- **El stack es libre.** Lo que elijas y por qué forma parte de la evaluación.
- Puedes usar un servicio gestionado para la base de datos o la autenticación (Supabase, Neon, Firebase…), pero **la autorización y el cálculo tienen que vivir en un backend que escribas tú**.
- Tiene que estar **desplegado en una URL pública**. Los planes gratuitos de Render, Railway, Fly, Vercel o similares son suficientes.

---

## Qué entregar

1. **La URL y credenciales de prueba:** un administrador y un colaborador de la empresa A, y un administrador de la empresa B.
2. **El repositorio**, con acceso para nosotros.
3. **Un README** que incluya:
   - cómo correrlo en local;
   - un diagrama simple de la arquitectura;
   - las decisiones importantes y qué alternativas descartaste;
   - qué dejaste fuera y por qué;
   - qué harías como siguientes pasos en el sistema.
4. **Pruebas automáticas del cálculo**, incluidos los dos ejemplos de la tabla.
5. **Una bitácora de IA:** qué herramientas usaste y tres momentos en los que corregiste o descartaste lo que generó, con el motivo.
6. **Una nota de negocio de una página:** a quién se lo venderías, qué problema le resuelve, cómo medirías que funciona y qué riesgos ves.

---

## Después de la entrega

Tendremos una sesión donde nos enseñas lo que construiste y le hacemos cambios juntos en vivo. Ten a mano tu editor y tus herramientas de IA.

Puedes consultarnos al correo con cualquier duda sobre la prueba y te responderemos lo mas pronto posible para no atrasar tu desarrollo.

¡Éxitos!
