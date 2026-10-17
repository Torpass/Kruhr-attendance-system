import {
  addDays,
  localDateOf,
  mondayOf,
  MINUTE_MS,
  startOfLocalDay,
  validatePolicy,
  type LocalDate,
  type ScheduleDay,
} from '@marcaje/core';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { hashSecret } from '../auth/password';
import type { Transaction as Tx } from './database.module';
import {
  companies,
  contracts,
  employees,
  payrollRuns,
  salaryStructures,
  shiftCorrections,
  shifts,
  users,
  workSchedules,
} from './schema';
import { connectForScript } from './script-client';

/**
 * Datos de demo para recorrer la app: colaboradores en las tres empresas, horarios, contratos
 * y ~5 semanas de marcajes que cubren los casos del enunciado (extra diurna y nocturna, turnos
 * que cruzan la medianoche, alerta semanal, correcciones) y los tres estados de "Hoy".
 *
 * Corre después de `pnpm db:seed`. Se puede repetir: borra y regenera los turnos de los
 * colaboradores de demo desde el inicio de la ventana, salvo los días de un lote validado o
 * pagado, que no se tocan. A Ana solo le agrega los días que no tienen turno.
 */
const seedEnv = z.object({ SEED_DEMO_PIN: z.string().regex(/^\d{4,6}$/) });

const WEEKS_BACK = 4;
const ADMIN_A = 'admin@empresa-a.test';

const OFFICE_DAYS: (ScheduleDay | null)[] = [
  ...Array.from({ length: 5 }, () => ({ start: '08:00', end: '17:00' })),
  null,
  null,
];

/** Lunes (0) a domingo (6) → jornada local del día, o `null` si no marca. */
type Pattern = (weekday: number, date: LocalDate) => [string, string] | null;
type Today = 'inside' | 'missing_clock_out' | 'not_clocked_in';

interface DemoEmployee {
  company: string;
  cedula: string;
  name: string;
  wage: number;
  schedule?: 'OFICINA';
  pattern: Pattern;
  today: Today;
}

const weekdays =
  (days: number[], start: string, end: string): Pattern =>
  (weekday) =>
    days.includes(weekday) ? [start, end] : null;
const MON_FRI = [0, 1, 2, 3, 4];

const DEMO: DemoEmployee[] = [
  {
    company: 'empresa-a-norte',
    cedula: '20111222',
    name: 'Carlos Rodríguez',
    wage: 4200,
    schedule: 'OFICINA',
    pattern: weekdays(MON_FRI, '08:00', '17:00'),
    today: 'inside',
  },
  {
    // Más de 10 h extra por semana: sale la alerta.
    company: 'empresa-a-norte',
    cedula: '22555666',
    name: 'José Hernández',
    wage: 3800,
    pattern: weekdays([0, 1, 2, 3, 4, 5], '07:00', '19:30'),
    today: 'inside',
  },
  {
    // Turno nocturno que cruza la medianoche; los martes se queda hasta las 07:30.
    company: 'empresa-a-norte',
    cedula: '18333444',
    name: 'María González',
    wage: 4000,
    pattern: (weekday) =>
      weekday === 1
        ? ['22:00', '07:30']
        : weekday < 5
          ? ['22:00', '06:00']
          : null,
    today: 'not_clocked_in',
  },
  {
    company: 'empresa-a-norte',
    cedula: '25777888',
    name: 'Luisa Martínez',
    wage: 3900,
    schedule: 'OFICINA',
    pattern: weekdays(MON_FRI, '08:00', '17:00'),
    today: 'missing_clock_out',
  },
  {
    // Falta algunos días.
    company: 'empresa-a-norte',
    cedula: '16999000',
    name: 'Miguel Castillo',
    wage: 3600,
    pattern: (weekday, date) =>
      weekday < 5 && hash(date) % 5 !== 0 ? ['09:00', '17:00'] : null,
    today: 'not_clocked_in',
  },
  {
    // Ejemplo 2 del enunciado como turno habitual: tarde con horas nocturnas ordinarias.
    company: 'empresa-a-sur',
    cedula: '23444555',
    name: 'Daniela Torres',
    wage: 3700,
    pattern: weekdays(MON_FRI, '14:00', '22:30'),
    today: 'inside',
  },
  {
    // Ejemplo 1 del enunciado: 2 h de extra diurna por día.
    company: 'empresa-b',
    cedula: '19222333',
    name: 'Andrés Silva',
    wage: 4100,
    pattern: weekdays(MON_FRI, '06:00', '16:00'),
    today: 'inside',
  },
  {
    company: 'empresa-b',
    cedula: '21666777',
    name: 'Gabriela Rojas',
    wage: 4300,
    pattern: weekdays([2, 3, 4, 5, 6], '19:00', '03:30'),
    today: 'not_clocked_in',
  },
];

/**
 * Ana: jornada exacta de 8 h, con los dos ejemplos del enunciado el lunes y martes de la semana
 * pasada. Sin variación, esa semana da exactamente la tabla del enunciado.
 */
const ANA = { company: 'empresa-a-norte', cedula: '12345678' };
function anaPattern(lastMonday: LocalDate): Pattern {
  return (weekday, date) => {
    if (date === lastMonday) return ['06:00', '16:00'];
    if (date === addDays(lastMonday, 1)) return ['14:00', '00:30'];
    return weekday < 5 ? ['08:00', '16:00'] : null;
  };
}

/** Pseudoaleatorio estable: el mismo día da los mismos minutos en cada corrida. */
function hash(text: string) {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const at = (date: LocalDate, minutes: number) =>
  new Date(startOfLocalDay(date).getTime() + minutes * MINUTE_MS);

/** Instantes del turno con unos minutos de variación (sin `seed`, exactos); si la salida es antes de la entrada, es al día siguiente. */
function shiftTimes(
  date: LocalDate,
  [start, end]: [string, string],
  seed: string | null,
) {
  const startMin = minutesOf(start);
  let endMin = minutesOf(end);
  if (endMin <= startMin) endMin += 24 * 60;
  if (seed === null) {
    return { clockIn: at(date, startMin), clockOut: at(date, endMin) };
  }
  const h = hash(seed + date);
  return {
    clockIn: at(date, startMin - 8 + (h % 14)),
    clockOut: at(date, endMin - 5 + ((h >> 4) % 16)),
  };
}

async function idsByCompany(tx: Tx) {
  const rows = await tx
    .select({
      id: companies.id,
      slug: companies.slug,
      groupId: companies.groupId,
    })
    .from(companies);
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return (slug: string) => {
    const company = bySlug.get(slug);
    if (!company)
      throw new Error(`Falta la empresa ${slug}: corre antes pnpm db:seed`);
    return company;
  };
}

async function officeSchedule(tx: Tx, groupId: string) {
  const policy = {
    overtimeMode: 'schedule' as const,
    ordinaryMinutes: 480,
    days: OFFICE_DAYS,
    breakMinutes: 60,
    breakAfterMinutes: 300,
    nightStart: '19:00',
    nightEnd: '05:00',
    weeklyOvertimeAlertMinutes: 600,
  };
  const errors = validatePolicy(policy);
  if (errors.length > 0) throw new Error(errors.join('; '));
  await tx
    .insert(workSchedules)
    .values({ groupId, code: 'OFICINA', name: 'Oficina L–V', ...policy })
    .onConflictDoNothing();
  const [row] = await tx
    .select({ id: workSchedules.id })
    .from(workSchedules)
    .where(
      and(
        eq(workSchedules.groupId, groupId),
        eq(workSchedules.code, 'OFICINA'),
      ),
    );
  return row.id;
}

async function structureOf(tx: Tx, groupId: string) {
  const [row] = await tx
    .select({ id: salaryStructures.id })
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.groupId, groupId),
        eq(salaryStructures.code, 'QUINCENAL_VE'),
      ),
    );
  if (!row)
    throw new Error(
      'Falta la estructura Quincenal VE: corre antes pnpm db:seed',
    );
  return row.id;
}

/** Días de la empresa que están en un lote validado o pagado: sus turnos no se tocan. */
async function lockedDays(tx: Tx, companyId: string, from: LocalDate) {
  const runs = await tx
    .select({ from: payrollRuns.dateFrom, to: payrollRuns.dateTo })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.companyId, companyId),
        inArray(payrollRuns.state, ['validated', 'paid']),
        gte(payrollRuns.dateTo, from),
      ),
    );
  return (date: LocalDate) =>
    runs.some((run) => run.from <= date && date <= run.to);
}

async function main() {
  const { client, db } = connectForScript();
  const now = new Date();
  const today = localDateOf(now);
  const from = addDays(mondayOf(today), -7 * WEEKS_BACK);
  const lastMonday = addDays(mondayOf(today), -7);
  const days = Array.from(
    { length: (Date.parse(today) - Date.parse(from)) / 86_400_000 },
    (_, i) => addDays(from, i),
  );

  try {
    const env = seedEnv.parse(process.env);
    const pinHash = await hashSecret(env.SEED_DEMO_PIN);
    const counts = await db.transaction(async (tx) => {
      const company = await idsByCompany(tx);
      const [admin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, ADMIN_A));
      if (!admin) throw new Error(`Falta ${ADMIN_A}: corre antes pnpm db:seed`);

      const groupA = company('empresa-a-norte').groupId;
      const office = await officeSchedule(tx, groupA);
      let created = 0;
      let corrected = 0;

      const insertShift = async (
        companyId: string,
        employeeId: string,
        times: { clockIn: Date; clockOut: Date | null },
      ) => {
        const [row] = await tx
          .insert(shifts)
          .values({ companyId, employeeId, ...times })
          .returning({ id: shifts.id });
        created++;
        return row.id;
      };

      for (const demo of DEMO) {
        const { id: companyId, groupId } = company(demo.company);
        const [employee] = await tx
          .insert(employees)
          .values({
            companyId,
            cedula: demo.cedula,
            name: demo.name,
            pinHash,
            hiredOn: '2026-01-01',
          })
          .onConflictDoUpdate({
            target: [employees.companyId, employees.cedula],
            set: { name: demo.name, pinHash, active: true },
          })
          .returning({ id: employees.id });

        const [contract] = await tx
          .select({ id: contracts.id })
          .from(contracts)
          .where(eq(contracts.employeeId, employee.id));
        if (!contract) {
          await tx.insert(contracts).values({
            employeeId: employee.id,
            companyId,
            structureId: await structureOf(tx, groupId),
            scheduleId: demo.schedule ? office : null,
            wage: demo.wage,
            dateStart: '2026-01-01',
          });
        }

        // Regenera los turnos de la ventana (y cualquier turno abierto), salvo los días bloqueados.
        const locked = await lockedDays(tx, companyId, from);
        const stale = (
          await tx
            .select({ id: shifts.id, clockIn: shifts.clockIn })
            .from(shifts)
            .where(
              and(
                eq(shifts.employeeId, employee.id),
                or(
                  gte(shifts.clockIn, startOfLocalDay(from)),
                  isNull(shifts.clockOut),
                ),
              ),
            )
        )
          .filter((shift) => !locked(localDateOf(shift.clockIn)))
          .map((shift) => shift.id);
        if (stale.length > 0) {
          await tx
            .delete(shiftCorrections)
            .where(inArray(shiftCorrections.shiftId, stale));
          await tx.delete(shifts).where(inArray(shifts.id, stale));
        }

        const yesterday = addDays(today, -1);
        for (const [i, date] of days.entries()) {
          if (locked(date)) continue;
          // Luisa no cerró el turno de ayer: queda abierto ("Sin salida").
          if (demo.today === 'missing_clock_out' && date === yesterday)
            continue;
          const plan = demo.pattern(i % 7, date);
          if (!plan) continue;
          const times = shiftTimes(date, plan, demo.cedula);
          if (times.clockOut > now) continue;
          const corrections = correctionFor(
            demo.cedula,
            date,
            lastMonday,
            times,
          );
          if (corrections) {
            const id = await insertShift(
              companyId,
              employee.id,
              corrections.after,
            );
            await tx.insert(shiftCorrections).values({
              shiftId: id,
              companyId,
              correctedBy: admin.id,
              reason: corrections.reason,
              before: snapshot(corrections.before),
              after: snapshot(corrections.after),
            });
            corrected++;
          } else {
            await insertShift(companyId, employee.id, times);
          }
        }

        if (demo.today === 'inside' && !locked(today)) {
          // Entró a su hora, pero hace entre 45 min y 8 h: "Dentro" a cualquier hora del día.
          const plan = demo.pattern(days.length % 7, today) ?? [
            '08:00',
            '17:00',
          ];
          const start = Math.max(
            Math.min(
              at(today, minutesOf(plan[0])).getTime(),
              now.getTime() - 45 * MINUTE_MS,
            ),
            now.getTime() - 8 * 60 * MINUTE_MS,
          );
          await insertShift(companyId, employee.id, {
            clockIn: new Date(start),
            clockOut: null,
          });
        }
        if (demo.today === 'missing_clock_out' && !locked(yesterday)) {
          await insertShift(companyId, employee.id, {
            clockIn: at(yesterday, minutesOf('08:02')),
            clockOut: null,
          });
        }
      }

      // Ana: solo los días que aún no tienen turno; nunca se le deja un turno abierto.
      const { id: anaCompany } = company(ANA.company);
      const [ana] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, anaCompany),
            eq(employees.cedula, ANA.cedula),
          ),
        );
      if (ana) {
        const locked = await lockedDays(tx, anaCompany, from);
        const existing = await tx
          .select({ clockIn: shifts.clockIn, clockOut: shifts.clockOut })
          .from(shifts)
          .where(
            and(
              eq(shifts.employeeId, ana.id),
              gte(shifts.clockIn, startOfLocalDay(addDays(from, -1))),
              lte(shifts.clockIn, now),
            ),
          );
        const pattern = anaPattern(lastMonday);
        for (const [i, date] of days.entries()) {
          const plan = pattern(i % 7, date);
          if (!plan || locked(date)) continue;
          const times = shiftTimes(date, plan, null);
          if (times.clockOut > now) continue;
          // Sin días ya marcados ni solapes con turnos existentes (cerrados o abiertos).
          const clash = existing.some(
            (shift) =>
              localDateOf(shift.clockIn) === date ||
              (shift.clockIn < times.clockOut &&
                (shift.clockOut ?? now) > times.clockIn),
          );
          if (!clash) await insertShift(anaCompany, ana.id, times);
        }
      }

      return { created, corrected };
    });

    console.log(`Demo lista (${from} → ${today}):`, counts);
  } finally {
    await client.end();
  }
}

const snapshot = (times: { clockIn: Date; clockOut: Date | null }) => ({
  clockIn: times.clockIn.toISOString(),
  clockOut: times.clockOut?.toISOString() ?? null,
});

/** Dos correcciones con motivo en la semana pasada: una salida olvidada y una entrada mal marcada. */
function correctionFor(
  cedula: string,
  date: LocalDate,
  lastMonday: LocalDate,
  after: { clockIn: Date; clockOut: Date },
) {
  if (cedula === '25777888' && date === addDays(lastMonday, 2)) {
    return {
      reason:
        'Olvidó marcar la salida; su supervisor confirmó que salió a las 17:00',
      before: { clockIn: after.clockIn, clockOut: null },
      after,
    };
  }
  if (cedula === '20111222' && date === addDays(lastMonday, 3)) {
    return {
      reason:
        'Marcó la entrada tarde por una falla del celular; llegó a la hora',
      before: {
        clockIn: new Date(after.clockIn.getTime() + 95 * MINUTE_MS),
        clockOut: after.clockOut,
      },
      after,
    };
  }
  return null;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
