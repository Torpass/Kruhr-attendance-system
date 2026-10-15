import { TZDate } from '@date-fns/tz';
import { CARACAS, localDateOf, MINUTE_MS, type LocalDate } from './dates';

/** Las primeras 8 horas de un turno son ordinarias; lo demás es hora extra. */
export const ORDINARY_MINUTES = 8 * 60;
/** Una hora es nocturna si cae entre las 19:00 y las 05:00 (incluye 19:00, excluye 05:00). */
export const NIGHT_STARTS_AT = 19;
export const NIGHT_ENDS_AT = 5;

export interface ClosedShift {
  clockIn: Date;
  clockOut: Date;
}

/** Minutos de un turno. Las horas extra se cuentan aparte de las nocturnas ordinarias. */
export interface ShiftMinutes {
  /** Día al que pertenece el turno: la fecha local en que empieza. */
  date: LocalDate;
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
}

const isNightHour = (hour: number) =>
  hour >= NIGHT_STARTS_AT || hour < NIGHT_ENDS_AT;

/** Siguiente frontera local (05:00 o 19:00) estrictamente después de `instant`. */
function nextBoundary(instant: number, timeZone: string): number {
  const local = new TZDate(instant, timeZone);
  const hour = local.getHours();
  if (hour < NIGHT_ENDS_AT) {
    local.setHours(NIGHT_ENDS_AT, 0, 0, 0);
  } else if (hour < NIGHT_STARTS_AT) {
    local.setHours(NIGHT_STARTS_AT, 0, 0, 0);
  } else {
    local.setDate(local.getDate() + 1);
    local.setHours(NIGHT_ENDS_AT, 0, 0, 0);
  }
  return local.getTime();
}

/** Parte [start, end) en las fronteras de 05:00 y 19:00 y suma los minutos diurnos y nocturnos. */
function splitDayNight(start: number, end: number, timeZone: string) {
  let day = 0;
  let night = 0;
  for (let cursor = start; cursor < end;) {
    const segmentEnd = Math.min(end, nextBoundary(cursor, timeZone));
    const minutes = (segmentEnd - cursor) / MINUTE_MS;
    if (isNightHour(new TZDate(cursor, timeZone).getHours())) night += minutes;
    else day += minutes;
    cursor = segmentEnd;
  }
  return { day, night };
}

const floorToMinute = (date: Date) =>
  Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;

/**
 * Clasifica los minutos de un turno cerrado.
 * Los segundos se ignoran: cada marca cuenta desde el minuto en que ocurrió.
 */
export function computeShift(
  { clockIn, clockOut }: ClosedShift,
  timeZone = CARACAS,
): ShiftMinutes {
  const start = floorToMinute(clockIn);
  const end = floorToMinute(clockOut);
  if (end < start) {
    throw new RangeError('La salida no puede ser anterior a la entrada');
  }

  const cutoff = Math.min(end, start + ORDINARY_MINUTES * MINUTE_MS);
  const ordinary = splitDayNight(start, cutoff, timeZone);
  const overtime = splitDayNight(cutoff, end, timeZone);

  return {
    date: localDateOf(start, timeZone),
    worked: (end - start) / MINUTE_MS,
    nightOrdinary: ordinary.night,
    overtimeDay: overtime.day,
    overtimeNight: overtime.night,
  };
}
