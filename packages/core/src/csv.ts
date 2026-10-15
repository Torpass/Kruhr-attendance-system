import type { Period } from './dates';
import type { HourTotals } from './period';

export interface CsvEmployeeRow {
  cedula: string;
  name: string;
  hours: Pick<HourTotals, 'overtimeDay' | 'overtimeNight' | 'nightOrdinary'>;
}

/** Las columnas de horas usan los nombres de las novedades del motor de nómina de Kru. */
export const CSV_HEADER = [
  'cedula',
  'nombre',
  'periodo_desde',
  'periodo_hasta',
  'overtimeDayHours',
  'overtimeNightHours',
  'nightShiftHours',
];

const SEPARATOR = ';';

/** Comillas solo si el valor trae el separador, comillas o saltos de línea (RFC 4180). */
function escapeField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * CSV del período: una fila por colaborador, separado por punto y coma, con punto decimal.
 * Sin BOM: lo consume el motor de nómina, no una persona en Excel.
 */
export function periodToCsv(rows: CsvEmployeeRow[], period: Period): string {
  const lines = rows.map(({ cedula, name, hours }) =>
    [
      cedula,
      name,
      period.from,
      period.to,
      hours.overtimeDay.toFixed(2),
      hours.overtimeNight.toFixed(2),
      hours.nightOrdinary.toFixed(2),
    ]
      .map(escapeField)
      .join(SEPARATOR),
  );
  return [CSV_HEADER.join(SEPARATOR), ...lines].join('\n') + '\n';
}
