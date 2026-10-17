import {
  addDays,
  CARACAS,
  localDateOf,
  MINUTE_MS,
  type LocalDate,
  type Period,
} from './dates';
import type { ShiftRecord } from './period';
import { DEFAULT_POLICY, type PolicyFor } from './schedule';
import { computeShift, programmedWindow, workdayOf } from './shift';

/** Minutos de gracia al llegar tarde, salir antes o quedarse más (no cuentan como desvío). */
export const PUNCTUALITY_TOLERANCE_MINUTES = 10;

/**
 * Estado de un día de un colaborador frente a su horario:
 * - `on_time`: cumplió la jornada dentro de la tolerancia.
 * - `late` / `left_early`: llegó tarde o se fue antes (pasada la tolerancia).
 * - `incomplete`: llegó tarde y además se fue antes.
 * - `extended`: trabajó más de lo programado (pasada la tolerancia).
 * - `absent`: tenía jornada, ya terminó y no marcó.
 * - `pending`: tiene jornada hoy y todavía no termina; aún no marca.
 * - `open`: marcó entrada y no salida.
 * - `worked_day_off`: marcó en un día libre de su horario.
 * - `unscheduled`: marcó, pero su horario no tiene jornada fija (sin comparación).
 * - `no_contract`: marcó un día en que no tenía contrato (sin horario contra qué comparar).
 */
export const DAY_STATUSES = [
  'on_time',
  'late',
  'left_early',
  'incomplete',
  'extended',
  'absent',
  'pending',
  'open',
  'worked_day_off',
  'unscheduled',
  'no_contract',
] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export interface AttendanceDay<T extends ShiftRecord = ShiftRecord> {
  /** Día de trabajo (el de la jornada, aunque el turno empiece pasada la medianoche). */
  date: LocalDate;
  status: DayStatus;
  /** Jornada programada ese día, o `null` si es libre o el horario no tiene jornada fija. */
  scheduled: { start: Date; end: Date } | null;
  /** Minutos programados: la jornada menos el descanso no pagado. */
  plannedMinutes: number;
  /** Primera entrada y última salida del día (`null` si no marcó o sigue abierto). */
  firstIn: Date | null;
  lastOut: Date | null;
  /** Minutos pagados según el motor (ya sin descanso). Solo turnos cerrados. */
  workedMinutes: number;
  /** Positivos: llegó tarde / se fue antes / llegó antes / se quedó después. */
  lateMinutes: number;
  leftEarlyMinutes: number;
  arrivedEarlyMinutes: number;
  stayedLateMinutes: number;
  /** `workedMinutes − plannedMinutes` (negativo: faltaron horas). 0 sin jornada. */
  differenceMinutes: number;
  shifts: T[];
}

const minutesBetween = (from: number, to: number) =>
  Math.round((to - from) / MINUTE_MS);

/**
 * Compara, día a día, la jornada programada de un colaborador con sus marcajes.
 *
 * - Cada turno se asigna a su día de trabajo (`workdayOf`); varios turnos el mismo día se juntan
 *   (primera entrada, última salida, minutos sumados).
 * - Los días sin jornada y sin marcajes no se devuelven, ni los días futuros sin marcajes.
 * - `now` decide si un día con jornada sin marcajes es `absent` (ya terminó) o `pending`.
 * - `hasContract` dice si ese día tenía contrato: sin contrato no hay jornada ni ausencias, y sus
 *   marcajes salen como `no_contract`.
 */
export function compareAttendance<T extends ShiftRecord>(
  shifts: T[],
  period: Period,
  policyFor: PolicyFor = () => DEFAULT_POLICY,
  {
    now = new Date(),
    tolerance = PUNCTUALITY_TOLERANCE_MINUTES,
    timeZone = CARACAS,
    hasContract = () => true,
  }: {
    now?: Date;
    tolerance?: number;
    timeZone?: string;
    hasContract?: (date: LocalDate) => boolean;
  } = {},
): AttendanceDay<T>[] {
  const byDay = new Map<LocalDate, T[]>();
  for (const shift of shifts) {
    const start = shift.clockIn.getTime();
    const end = (shift.clockOut ?? now).getTime();
    const policy = policyFor(localDateOf(start, timeZone));
    const { date } = workdayOf([start, Math.max(end, start)], policy, timeZone);
    byDay.set(date, [...(byDay.get(date) ?? []), shift]);
  }

  const days: AttendanceDay<T>[] = [];
  for (let date = period.from; date <= period.to; date = addDays(date, 1)) {
    const covered = hasContract(date);
    const policy = policyFor(date);
    const window = covered ? programmedWindow(date, policy, timeZone) : null;
    const dayShifts = (byDay.get(date) ?? []).sort(
      (a, b) => a.clockIn.getTime() - b.clockIn.getTime(),
    );
    if (!window && dayShifts.length === 0) continue;

    const span = window ? minutesBetween(window[0], window[1]) : 0;
    const plannedMinutes =
      window && span > policy.breakAfterMinutes
        ? Math.max(0, span - policy.breakMinutes)
        : span;
    const closed = dayShifts.filter((s) => s.clockOut !== null);
    const open = dayShifts.some((s) => s.clockOut === null);
    const firstIn = dayShifts[0]?.clockIn ?? null;
    const lastOut =
      open || closed.length === 0
        ? null
        : new Date(Math.max(...closed.map((s) => s.clockOut!.getTime())));
    const workedMinutes = closed.reduce(
      (total, s) =>
        total +
        computeShift(
          { clockIn: s.clockIn, clockOut: s.clockOut! },
          policyFor(localDateOf(s.clockIn, timeZone)),
          timeZone,
        ).worked,
      0,
    );

    const day: AttendanceDay<T> = {
      date,
      status: 'on_time',
      scheduled: window
        ? { start: new Date(window[0]), end: new Date(window[1]) }
        : null,
      plannedMinutes,
      firstIn,
      lastOut,
      workedMinutes,
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      arrivedEarlyMinutes: 0,
      stayedLateMinutes: 0,
      differenceMinutes: window ? workedMinutes - plannedMinutes : 0,
      shifts: dayShifts,
    };

    if (dayShifts.length === 0) {
      // Con jornada y sin marcajes: ausente si la jornada ya terminó; si no, pendiente.
      if (window![0] > now.getTime()) continue; // día futuro
      day.status = window![1] <= now.getTime() ? 'absent' : 'pending';
      day.differenceMinutes = day.status === 'absent' ? -plannedMinutes : 0;
      days.push(day);
      continue;
    }

    if (!window) {
      day.status = !covered
        ? 'no_contract'
        : policy.days?.some(Boolean)
          ? 'worked_day_off'
          : 'unscheduled';
      days.push(day);
      continue;
    }

    const delta = minutesBetween(window[0], firstIn.getTime());
    day.lateMinutes = Math.max(0, delta);
    day.arrivedEarlyMinutes = Math.max(0, -delta);
    if (lastOut) {
      const out = minutesBetween(window[1], lastOut.getTime());
      day.stayedLateMinutes = Math.max(0, out);
      day.leftEarlyMinutes = Math.max(0, -out);
    }

    const late = day.lateMinutes > tolerance;
    const leftEarly = day.leftEarlyMinutes > tolerance;
    day.status = open
      ? 'open'
      : late && leftEarly
        ? 'incomplete'
        : late
          ? 'late'
          : leftEarly
            ? 'left_early'
            : day.differenceMinutes > tolerance
              ? 'extended'
              : 'on_time';
    if (open) day.differenceMinutes = 0;
    days.push(day);
  }
  return days;
}
