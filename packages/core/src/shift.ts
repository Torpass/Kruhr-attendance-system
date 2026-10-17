import { TZDate } from '@date-fns/tz';
import {
  addDays,
  CARACAS,
  localDateOf,
  MINUTE_MS,
  startOfLocalDay,
  type LocalDate,
} from './dates';
import { DEFAULT_POLICY, minutesOfDay, type WorkPolicy } from './schedule';

export interface ClosedShift {
  clockIn: Date;
  clockOut: Date;
}

/** Minutos de un turno. Las horas extra se cuentan aparte de las nocturnas ordinarias. */
export interface ShiftMinutes {
  /** Día al que pertenece el turno: la fecha local en que empieza. */
  date: LocalDate;
  /** Minutos pagados: la duración menos el descanso no pagado. */
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
}

/** Intervalo [inicio, fin) en milisegundos. */
type Interval = [number, number];

const localMinutes = (instant: number, timeZone: string) => {
  const local = new TZDate(instant, timeZone);
  return local.getHours() * 60 + local.getMinutes();
};

/** Instante de las `minutes` (desde la medianoche) del día local de `instant`, `plusDays` después. */
function atLocalMinutes(
  instant: number,
  minutes: number,
  plusDays: number,
  timeZone: string,
) {
  const local = new TZDate(instant, timeZone);
  local.setDate(local.getDate() + plusDays);
  local.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return local.getTime();
}

function nightWindow(policy: WorkPolicy) {
  const start = minutesOfDay(policy.nightStart);
  const end = minutesOfDay(policy.nightEnd);
  // Si empieza después de terminar (19:00–05:00), cruza la medianoche.
  const isNight = (m: number) =>
    start > end ? m >= start || m < end : m >= start && m < end;
  return { start, end, isNight };
}

/** Parte [start, end) en las fronteras de la ventana nocturna y suma los minutos diurnos y nocturnos. */
function splitDayNight(
  [start, end]: Interval,
  policy: WorkPolicy,
  timeZone: string,
) {
  const night = nightWindow(policy);
  let day = 0;
  let nightMinutes = 0;
  for (let cursor = start; cursor < end;) {
    // Siguiente frontera estrictamente posterior: hoy o mañana, a la hora de inicio o de fin.
    const boundary = Math.min(
      ...[0, 1]
        .flatMap((plus) =>
          [night.start, night.end].map((m) =>
            atLocalMinutes(cursor, m, plus, timeZone),
          ),
        )
        .filter((t) => t > cursor),
    );
    const segmentEnd = Math.min(end, boundary);
    const minutes = (segmentEnd - cursor) / MINUTE_MS;
    if (night.isNight(localMinutes(cursor, timeZone))) nightMinutes += minutes;
    else day += minutes;
    cursor = segmentEnd;
  }
  return { day, night: nightMinutes };
}

/** Lunes = 0 … domingo = 6. */
const weekdayIndex = (date: LocalDate) =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const overlap = ([a, b]: Interval, [c, d]: Interval) =>
  Math.max(0, Math.min(b, d) - Math.max(a, c));

/**
 * Jornada programada que corresponde al turno: la del día en que empieza o, si una jornada
 * nocturna del día anterior lo cubre más, esa. `null` si ese día es libre.
 */
function scheduledWindow(
  shift: Interval,
  date: LocalDate,
  policy: WorkPolicy,
  timeZone: string,
): Interval | null {
  const windows = [date, addDays(date, -1)].flatMap((day) => {
    const programmed = policy.days?.[weekdayIndex(day)];
    if (!programmed) return [];
    const dayStart = startOfLocalDay(day, timeZone).getTime();
    const from = minutesOfDay(programmed.start);
    const to = minutesOfDay(programmed.end);
    return [
      [
        atLocalMinutes(dayStart, from, 0, timeZone),
        atLocalMinutes(dayStart, to, to <= from ? 1 : 0, timeZone),
      ] as Interval,
    ];
  });
  if (windows.length === 0) return null;
  return windows.reduce((best, w) =>
    overlap(shift, w) > overlap(shift, best) ? w : best,
  );
}

const floorToMinute = (date: Date) =>
  Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;

const valid = (intervals: Interval[]) => intervals.filter(([a, b]) => b > a);

/**
 * Clasifica los minutos de un turno cerrado según la política del horario.
 * Los segundos se ignoran: cada marca cuenta desde el minuto en que ocurrió.
 *
 * - Modo `duration`: las primeras `ordinaryMinutes` (más el descanso) son ordinarias.
 * - Modo `schedule`: es ordinario lo que cae dentro de la jornada programada; lo demás es extra.
 * - El descanso no pagado sale primero de lo ordinario (diurno y luego nocturno) y, si no
 *   alcanza, de la extra.
 * - Las horas extra se clasifican en diurnas o nocturnas según la hora en que ocurrieron.
 */
export function computeShift(
  { clockIn, clockOut }: ClosedShift,
  policy: WorkPolicy = DEFAULT_POLICY,
  timeZone = CARACAS,
): ShiftMinutes {
  const start = floorToMinute(clockIn);
  const end = floorToMinute(clockOut);
  if (end < start) {
    throw new RangeError('La salida no puede ser anterior a la entrada');
  }
  const date = localDateOf(start, timeZone);
  const total = (end - start) / MINUTE_MS;
  const unpaidBreak =
    total > policy.breakAfterMinutes ? Math.min(policy.breakMinutes, total) : 0;

  let ordinary: Interval[];
  let overtime: Interval[];
  if (policy.overtimeMode === 'schedule') {
    const window = scheduledWindow([start, end], date, policy, timeZone);
    if (window) {
      const [ws, we] = window;
      ordinary = valid([[Math.max(start, ws), Math.min(end, we)]]);
      overtime = valid([
        [start, Math.min(end, ws)],
        [Math.max(start, we), end],
      ]);
    } else {
      ordinary = [];
      overtime = [[start, end]];
    }
  } else {
    const cutoff = Math.min(
      end,
      start + (policy.ordinaryMinutes + unpaidBreak) * MINUTE_MS,
    );
    ordinary = valid([[start, cutoff]]);
    overtime = valid([[cutoff, end]]);
  }

  const sum = (intervals: Interval[]) =>
    intervals
      .map((interval) => splitDayNight(interval, policy, timeZone))
      .reduce((t, p) => ({ day: t.day + p.day, night: t.night + p.night }), {
        day: 0,
        night: 0,
      });
  const o = sum(ordinary);
  const x = sum(overtime);

  // El descanso se descuenta en orden: ordinario diurno, ordinario nocturno, extra diurna, extra nocturna.
  let pending = unpaidBreak;
  const take = (available: number) => {
    const taken = Math.min(available, pending);
    pending -= taken;
    return available - taken;
  };
  take(o.day);
  const nightOrdinary = take(o.night);
  const overtimeDay = take(x.day);
  const overtimeNight = take(x.night);

  return {
    date,
    worked: total - unpaidBreak,
    nightOrdinary,
    overtimeDay,
    overtimeNight,
  };
}

/** Un turno abierto por 16 h o más es un olvido ("sin salida"): no se cierra marcando, lo corrige RRHH. */
export const STALE_OPEN_SHIFT_MINUTES = 16 * 60;

export function isStaleOpenShift(clockIn: Date, now: Date): boolean {
  return (
    now.getTime() - clockIn.getTime() >= STALE_OPEN_SHIFT_MINUTES * MINUTE_MS
  );
}
