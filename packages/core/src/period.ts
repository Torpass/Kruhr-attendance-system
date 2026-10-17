import {
  addDays,
  CARACAS,
  isWithin,
  localDateOf,
  mondayOf,
  type LocalDate,
  type Period,
} from './dates';
import { DEFAULT_POLICY, type PolicyFor } from './schedule';
import { computeShift } from './shift';

export interface ShiftRecord {
  clockIn: Date;
  /** `null` mientras el turno sigue abierto. */
  clockOut: Date | null;
}

export interface MinuteTotals {
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
}

export type HourTotals = MinuteTotals;

export interface WeekOvertime {
  /** Lunes de la semana. */
  weekStart: LocalDate;
  weekEnd: LocalDate;
  overtimeMinutes: number;
  overtimeHours: number;
  alert: boolean;
}

export interface PeriodSummary {
  minutes: MinuteTotals;
  /** Las horas se redondean a 2 decimales solo aquí, al final del período. */
  hours: HourTotals;
  /** Turnos abiertos que empiezan en el período: no se calculan hasta que se cierren. */
  openShifts: number;
  /** Cada semana (lunes a domingo) que toca el período, con todas sus horas extra. */
  weeks: WeekOvertime[];
  overtimeAlert: boolean;
}

/** Minutos a horas con 2 decimales. */
export const minutesToHours = (minutes: number) =>
  Math.round((minutes * 100) / 60) / 100;

const emptyTotals = (): MinuteTotals => ({
  worked: 0,
  nightOrdinary: 0,
  overtimeDay: 0,
  overtimeNight: 0,
});

/**
 * Resume los turnos de un colaborador en un período.
 *
 * - Un turno pertenece al día en que empieza, aunque termine al día siguiente.
 * - Los totales solo suman los turnos que empiezan dentro del período.
 * - Las alertas miran semanas completas. Para una quincena que corta una semana, hay que
 *   pasar también los turnos de esa semana fuera del período (ver `alertWindow`).
 * - `policyFor` da la política del horario vigente en cada día (por defecto, la del enunciado):
 *   cada turno se calcula con la de su día, y el umbral de la alerta es el del lunes de la semana.
 */
export function summarizePeriod(
  shifts: ShiftRecord[],
  period: Period,
  policyFor: PolicyFor = () => DEFAULT_POLICY,
  timeZone = CARACAS,
): PeriodSummary {
  const totals = emptyTotals();
  let openShifts = 0;

  const weeklyOvertime = new Map<LocalDate, number>();
  for (
    let week = mondayOf(period.from);
    week <= period.to;
    week = addDays(week, 7)
  ) {
    weeklyOvertime.set(week, 0);
  }

  for (const shift of shifts) {
    if (shift.clockOut === null) {
      if (isWithin(localDateOf(shift.clockIn, timeZone), period)) openShifts++;
      continue;
    }

    const minutes = computeShift(
      { clockIn: shift.clockIn, clockOut: shift.clockOut },
      policyFor(localDateOf(shift.clockIn, timeZone)),
      timeZone,
    );
    if (isWithin(minutes.date, period)) {
      totals.worked += minutes.worked;
      totals.nightOrdinary += minutes.nightOrdinary;
      totals.overtimeDay += minutes.overtimeDay;
      totals.overtimeNight += minutes.overtimeNight;
    }

    const week = mondayOf(minutes.date);
    const weekTotal = weeklyOvertime.get(week);
    if (weekTotal !== undefined) {
      weeklyOvertime.set(
        week,
        weekTotal + minutes.overtimeDay + minutes.overtimeNight,
      );
    }
  }

  const weeks = [...weeklyOvertime].map(([weekStart, overtimeMinutes]) => ({
    weekStart,
    weekEnd: addDays(weekStart, 6),
    overtimeMinutes,
    overtimeHours: minutesToHours(overtimeMinutes),
    alert: overtimeMinutes > policyFor(weekStart).weeklyOvertimeAlertMinutes,
  }));

  return {
    minutes: totals,
    hours: {
      worked: minutesToHours(totals.worked),
      nightOrdinary: minutesToHours(totals.nightOrdinary),
      overtimeDay: minutesToHours(totals.overtimeDay),
      overtimeNight: minutesToHours(totals.overtimeNight),
    },
    openShifts,
    weeks,
    overtimeAlert: weeks.some((week) => week.alert),
  };
}

/**
 * Rango de fechas de turnos que hay que cargar para resumir un período:
 * de lunes de la primera semana a domingo de la última, para que las alertas vean semanas completas.
 */
export function alertWindow(period: Period): Period {
  const from = mondayOf(period.from);
  return { from, to: addDays(mondayOf(period.to), 6) };
}
