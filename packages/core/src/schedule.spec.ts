import { summarizePeriod } from './period';
import { DEFAULT_POLICY, validatePolicy, type WorkPolicy } from './schedule';
import { computeShift } from './shift';

/** Hora de Caracas (UTC−4) → instante. */
const caracas = (local: string) => new Date(`${local}-04:00`);
const shift = (from: string, to: string, policy: Partial<WorkPolicy> = {}) =>
  computeShift(
    { clockIn: caracas(from), clockOut: caracas(to) },
    { ...DEFAULT_POLICY, ...policy },
  );

const office = { start: '08:00', end: '17:00' };
/** Lunes a viernes de 08:00 a 17:00 con 1 h de descanso. */
const officeSchedule: Partial<WorkPolicy> = {
  overtimeMode: 'schedule',
  days: [office, office, office, office, office, null, null],
  breakMinutes: 60,
};

// 2026-10-05 es lunes; 2026-10-11, domingo.
describe('computeShift con política de horario', () => {
  describe('modo duración', () => {
    it('jornada de 7,5 h: lo que pasa de 7,5 h es extra', () => {
      expect(
        shift('2026-10-05T08:00', '2026-10-05T17:00', { ordinaryMinutes: 450 }),
      ).toMatchObject({
        worked: 540,
        overtimeDay: 90,
        overtimeNight: 0,
      });
    });

    it('el descanso no se paga ni corre el inicio de la extra', () => {
      // 9 h con 1 h de descanso: 8 h pagadas, todas ordinarias.
      expect(
        shift('2026-10-05T09:00', '2026-10-05T18:00', { breakMinutes: 60 }),
      ).toMatchObject({
        worked: 480,
        overtimeDay: 0,
        overtimeNight: 0,
      });
    });

    it('un turno corto (hasta "descanso a partir de") no descuenta descanso', () => {
      expect(
        shift('2026-10-05T09:00', '2026-10-05T13:00', { breakMinutes: 60 }),
      ).toMatchObject({
        worked: 240,
      });
    });

    it('ventana nocturna de 18:00 a 06:00', () => {
      expect(
        shift('2026-10-05T10:00', '2026-10-05T20:00', {
          nightStart: '18:00',
          nightEnd: '06:00',
        }),
      ).toMatchObject({
        worked: 600,
        nightOrdinary: 0,
        overtimeDay: 0,
        overtimeNight: 120,
      });
    });

    it('ventana nocturna que no cruza la medianoche (00:00 a 06:00)', () => {
      // Ordinarias 20:00–04:00 (nocturnas 00:00–04:00), extra 04:00–05:00 nocturna.
      expect(
        shift('2026-10-05T20:00', '2026-10-06T05:00', {
          nightStart: '00:00',
          nightEnd: '06:00',
        }),
      ).toMatchObject({
        worked: 540,
        nightOrdinary: 240,
        overtimeDay: 0,
        overtimeNight: 60,
      });
    });
  });

  describe('modo horario', () => {
    it('lo de antes de la entrada y después de la salida es extra', () => {
      // 07:00–19:00: jornada 08–17 (9 h − 1 h de descanso = 8 h), extra 07–08 y 17–19.
      expect(
        shift('2026-10-05T07:00', '2026-10-05T19:00', officeSchedule),
      ).toEqual({
        date: '2026-10-05',
        worked: 660,
        nightOrdinary: 0,
        overtimeDay: 180,
        overtimeNight: 0,
      });
    });

    it('salir antes no genera extra aunque el turno sea largo para otra jornada', () => {
      expect(
        shift('2026-10-05T08:00', '2026-10-05T16:00', officeSchedule),
      ).toMatchObject({
        worked: 420,
        overtimeDay: 0,
        overtimeNight: 0,
      });
    });

    it('en un día libre todo el turno es extra', () => {
      expect(
        shift('2026-10-11T09:00', '2026-10-11T13:00', officeSchedule),
      ).toMatchObject({
        date: '2026-10-11',
        worked: 240,
        overtimeDay: 240,
        overtimeNight: 0,
      });
    });

    it('jornada nocturna 22:00–06:00: la extra de la mañana es diurna', () => {
      const night = { start: '22:00', end: '06:00' };
      expect(
        shift('2026-10-05T22:00', '2026-10-06T07:00', {
          overtimeMode: 'schedule',
          days: [night, night, night, night, night, null, null],
        }),
      ).toMatchObject({
        worked: 540,
        nightOrdinary: 420,
        overtimeDay: 60,
        overtimeNight: 0,
      });
    });

    it('si llega pasada la medianoche, usa la jornada nocturna del día anterior', () => {
      // El martes es libre, pero la jornada del lunes (22:00–06:00) cubre el turno.
      const night = { start: '22:00', end: '06:00' };
      expect(
        shift('2026-10-06T00:30', '2026-10-06T06:00', {
          overtimeMode: 'schedule',
          days: [night, null, null, null, null, null, null],
        }),
      ).toMatchObject({
        date: '2026-10-06',
        worked: 330,
        nightOrdinary: 270,
        overtimeDay: 0,
        overtimeNight: 0,
      });
    });
  });
});

describe('summarizePeriod con política por día', () => {
  const week = { from: '2026-10-05', to: '2026-10-11' };
  const long = (day: string) => ({
    clockIn: caracas(`${day}T08:00`),
    clockOut: caracas(`${day}T19:00`),
  });

  it('cada turno usa la política de su día', () => {
    // Lunes con la regla del enunciado (3 h extra); martes con horario de oficina (2 h extra).
    const summary = summarizePeriod(
      [long('2026-10-05'), long('2026-10-06')],
      week,
      (date) =>
        date === '2026-10-05'
          ? DEFAULT_POLICY
          : { ...DEFAULT_POLICY, ...officeSchedule },
    );
    expect(summary.minutes).toMatchObject({
      worked: 660 + 600,
      overtimeDay: 180 + 120,
    });
  });

  it('la alerta usa el umbral del horario', () => {
    const shifts = ['2026-10-05', '2026-10-06'].map(long); // 6 h extra en la semana
    expect(summarizePeriod(shifts, week).overtimeAlert).toBe(false);
    expect(
      summarizePeriod(shifts, week, () => ({
        ...DEFAULT_POLICY,
        weeklyOvertimeAlertMinutes: 5 * 60,
      })).overtimeAlert,
    ).toBe(true);
  });
});

describe('validatePolicy', () => {
  it('la política por defecto es válida', () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
  });

  it.each([
    ['modo horario sin días', { overtimeMode: 'schedule' as const }, '7 días'],
    [
      'sin días laborables',
      { overtimeMode: 'schedule' as const, days: Array(7).fill(null) },
      'al menos un día',
    ],
    ['hora mal escrita', { nightStart: '7pm' }, 'HH:MM'],
    [
      'ventana nocturna vacía',
      { nightStart: '19:00', nightEnd: '19:00' },
      'misma hora',
    ],
    ['jornada en cero', { ordinaryMinutes: 0 }, 'jornada ordinaria'],
    [
      'entrada igual a la salida',
      {
        overtimeMode: 'schedule' as const,
        days: [
          office,
          office,
          office,
          office,
          { start: '09:00', end: '09:00' },
          null,
          null,
        ],
      },
      'no pueden ser iguales',
    ],
  ])('%s', (_, changes, message) => {
    expect(
      validatePolicy({ ...DEFAULT_POLICY, ...changes }).join(' '),
    ).toContain(message);
  });
});
