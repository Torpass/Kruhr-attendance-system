/**
 * Política de un horario: cuándo empieza la hora extra, el descanso no pagado, la ventana
 * nocturna y la alerta semanal. `DEFAULT_POLICY` reproduce las reglas del enunciado.
 */

/**
 * - `duration`: las primeras `ordinaryMinutes` del turno son ordinarias; lo demás es extra.
 * - `schedule`: es ordinario lo que cae dentro de la jornada programada del día; lo de antes de la
 *   entrada, después de la salida o en un día libre es extra.
 */
export const OVERTIME_MODES = ['duration', 'schedule'] as const;
export type OvertimeMode = (typeof OVERTIME_MODES)[number];

/** Jornada de un día, en hora local `HH:MM`. Si `end` ≤ `start`, termina al día siguiente. */
export interface ScheduleDay {
  start: string;
  end: string;
}

export interface WorkPolicy {
  overtimeMode: OvertimeMode;
  /** Minutos ordinarios por turno (modo `duration`). */
  ordinaryMinutes: number;
  /** Semana de lunes (0) a domingo (6); `null` es día libre. Obligatoria en modo `schedule`. */
  days: (ScheduleDay | null)[] | null;
  /** Descanso no pagado que se descuenta de los turnos que duran más de `breakAfterMinutes`. */
  breakMinutes: number;
  breakAfterMinutes: number;
  /** Ventana nocturna en hora local `HH:MM` (puede cruzar la medianoche). */
  nightStart: string;
  nightEnd: string;
  /** Más de estos minutos extra en una semana generan una alerta (no bloquea nada). */
  weeklyOvertimeAlertMinutes: number;
}

/** Las primeras 8 horas de un turno son ordinarias; lo demás es hora extra. */
export const ORDINARY_MINUTES = 8 * 60;
/** Más de 10 horas extra en una semana genera una alerta (no bloquea nada). */
export const WEEKLY_OVERTIME_ALERT_MINUTES = 10 * 60;

/** Reglas del enunciado: 8 h ordinarias, nocturna de 19:00 a 05:00, sin descanso, alerta a las 10 h. */
export const DEFAULT_POLICY: WorkPolicy = {
  overtimeMode: 'duration',
  ordinaryMinutes: ORDINARY_MINUTES,
  days: null,
  breakMinutes: 0,
  breakAfterMinutes: 5 * 60,
  nightStart: '19:00',
  nightEnd: '05:00',
  weeklyOvertimeAlertMinutes: WEEKLY_OVERTIME_ALERT_MINUTES,
};

/** Política para una fecha local (el horario del contrato vigente ese día). */
export type PolicyFor = (date: string) => WorkPolicy;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTimeOfDay = (value: string) => TIME_PATTERN.test(value);

/** `HH:MM` → minutos desde la medianoche. */
export function minutesOfDay(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new RangeError(`Hora inválida: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

const isMinutes = (value: number, max: number) =>
  Number.isInteger(value) && value >= 0 && value <= max;

/** Errores de consistencia de una política, en español; vacío si es válida. */
export function validatePolicy(policy: WorkPolicy): string[] {
  const errors: string[] = [];

  if (!OVERTIME_MODES.includes(policy.overtimeMode))
    errors.push('Modo de hora extra desconocido');
  if (
    policy.overtimeMode === 'duration' &&
    (!isMinutes(policy.ordinaryMinutes, 24 * 60) ||
      policy.ordinaryMinutes === 0)
  ) {
    errors.push('La jornada ordinaria va de 1 minuto a 24 horas');
  }

  if (policy.overtimeMode === 'schedule') {
    if (!policy.days || policy.days.length !== 7) {
      errors.push(
        'El horario necesita los 7 días de la semana (lunes a domingo)',
      );
    } else if (policy.days.every((day) => day === null)) {
      errors.push('El horario necesita al menos un día laborable');
    }
  }
  policy.days?.forEach((day, index) => {
    if (!day) return;
    if (!isTimeOfDay(day.start) || !isTimeOfDay(day.end)) {
      errors.push(`Día ${index + 1}: las horas van en formato HH:MM`);
    } else if (day.start === day.end) {
      errors.push(
        `Día ${index + 1}: la entrada y la salida no pueden ser iguales`,
      );
    }
  });

  if (!isMinutes(policy.breakMinutes, 24 * 60))
    errors.push('El descanso va en minutos enteros');
  if (!isMinutes(policy.breakAfterMinutes, 24 * 60))
    errors.push('"Descanso a partir de" va en minutos enteros');

  if (!isTimeOfDay(policy.nightStart) || !isTimeOfDay(policy.nightEnd)) {
    errors.push('La ventana nocturna va en formato HH:MM');
  } else if (policy.nightStart === policy.nightEnd) {
    errors.push(
      'La ventana nocturna no puede empezar y terminar a la misma hora',
    );
  }

  if (!isMinutes(policy.weeklyOvertimeAlertMinutes, 7 * 24 * 60)) {
    errors.push('La alerta semanal va en minutos enteros');
  }
  return errors;
}
