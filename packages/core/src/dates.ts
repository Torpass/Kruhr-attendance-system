import { TZDate } from '@date-fns/tz';

/** Todo se interpreta en la hora de Caracas (enunciado). */
export const CARACAS = 'America/Caracas';

export const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Fecha de calendario `YYYY-MM-DD`, sin hora ni zona. */
export type LocalDate = string;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

function toUtcMs(date: LocalDate): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Fecha inválida: ${date}`);
  const [, y, m, d] = match.map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (fromUtcMs(ms) !== date) throw new RangeError(`Fecha inválida: ${date}`);
  return ms;
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isLocalDate(value: string): boolean {
  try {
    toUtcMs(value);
    return true;
  } catch {
    return false;
  }
}

/** Fecha de calendario de un instante en la zona dada. */
export function localDateOf(
  instant: Date | number,
  timeZone = CARACAS,
): LocalDate {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  const local = new TZDate(ms, timeZone);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/** Instante en que empieza (00:00) un día local en la zona dada. */
export function startOfLocalDay(date: LocalDate, timeZone = CARACAS): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Date normal: TZDate serializa con offset y la API espera ISO en UTC.
  return new Date(new TZDate(y, m - 1, d, timeZone).getTime());
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Lunes de la semana (lunes a domingo) que contiene la fecha. */
export function mondayOf(date: LocalDate): LocalDate {
  const weekday = new Date(toUtcMs(date)).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

/** Período inclusivo en fechas locales. */
export interface Period {
  from: LocalDate;
  to: LocalDate;
}

export type PeriodKind = 'week' | 'first_half' | 'second_half';

/**
 * Semana de lunes a domingo, o quincena: del 1 al 15 y del 16 a fin de mes.
 * `date` es cualquier día dentro del período buscado (la quincena toma su mes).
 */
export function periodFor(kind: PeriodKind, date: LocalDate): Period {
  if (kind === 'week') {
    const from = mondayOf(date);
    return { from, to: addDays(from, 6) };
  }
  const month = date.slice(0, 7);
  if (kind === 'first_half') {
    return { from: `${month}-01`, to: `${month}-15` };
  }
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-16`, to: `${month}-${pad(lastDay)}` };
}

export function isWithin(date: LocalDate, { from, to }: Period): boolean {
  return date >= from && date <= to;
}
