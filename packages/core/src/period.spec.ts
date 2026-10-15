import {
  alertWindow,
  minutesToHours,
  summarizePeriod,
  type ShiftRecord,
} from './period';

const caracas = (local: string) => new Date(`${local}-04:00`);
const closed = (from: string, to: string): ShiftRecord => ({
  clockIn: caracas(from),
  clockOut: caracas(to),
});
const open = (from: string): ShiftRecord => ({
  clockIn: caracas(from),
  clockOut: null,
});

const week = { from: '2026-10-05', to: '2026-10-11' }; // lunes a domingo

describe('summarizePeriod', () => {
  it('suma los dos ejemplos del enunciado como la fila del CSV', () => {
    const summary = summarizePeriod(
      [
        closed('2026-10-05T06:00', '2026-10-05T16:00'),
        closed('2026-10-06T14:00', '2026-10-07T00:30'),
      ],
      week,
    );
    expect(summary.hours).toEqual({
      worked: 20.5,
      overtimeDay: 2,
      overtimeNight: 2.5,
      nightOrdinary: 3,
    });
    expect(summary.overtimeAlert).toBe(false);
  });

  it('redondea al final del período, no turno por turno', () => {
    // Tres turnos con 20 min de extra: 1,00 h, no 3 × 0,33 = 0,99 h.
    const summary = summarizePeriod(
      [
        closed('2026-10-05T08:00', '2026-10-05T16:20'),
        closed('2026-10-06T08:00', '2026-10-06T16:20'),
        closed('2026-10-07T08:00', '2026-10-07T16:20'),
      ],
      week,
    );
    expect(summary.minutes.overtimeDay).toBe(60);
    expect(summary.hours.overtimeDay).toBe(1);
  });

  it('excluye los turnos abiertos y los cuenta como pendientes', () => {
    const summary = summarizePeriod(
      [
        closed('2026-10-05T08:00', '2026-10-05T12:00'),
        open('2026-10-09T08:00'),
        open('2026-10-20T08:00'), // fuera del período
      ],
      week,
    );
    expect(summary.minutes.worked).toBe(240);
    expect(summary.openShifts).toBe(1);
  });

  it('un turno del domingo que termina el lunes cuenta en la semana del domingo', () => {
    const sundayNight = closed('2026-10-11T23:00', '2026-10-12T03:00');
    expect(summarizePeriod([sundayNight], week).minutes.worked).toBe(240);
    expect(
      summarizePeriod([sundayNight], { from: '2026-10-12', to: '2026-10-18' })
        .minutes.worked,
    ).toBe(0);
  });

  describe('alerta de más de 10 h extra en la semana', () => {
    // Cinco turnos de 10 h: 5 × 2 h = 10 h extra exactas.
    const tenHours = ['05', '06', '07', '08', '09'].map((day) =>
      closed(`2026-10-${day}T06:00`, `2026-10-${day}T16:00`),
    );

    it('con 10 h exactas no salta', () => {
      const summary = summarizePeriod(tenHours, week);
      expect(summary.weeks).toEqual([
        {
          weekStart: '2026-10-05',
          weekEnd: '2026-10-11',
          overtimeMinutes: 600,
          overtimeHours: 10,
          alert: false,
        },
      ]);
      expect(summary.overtimeAlert).toBe(false);
    });

    it('con 10 h y 1 min salta', () => {
      const summary = summarizePeriod(
        [...tenHours, closed('2026-10-10T06:00', '2026-10-10T14:01')],
        week,
      );
      expect(summary.weeks[0].overtimeMinutes).toBe(601);
      expect(summary.overtimeAlert).toBe(true);
    });

    it('en una quincena mira la semana completa, aunque salga del período', () => {
      const firstHalf = { from: '2026-10-01', to: '2026-10-15' };
      // Semana 12–18: 2 h extra dentro de la quincena y 9 h fuera (6 h el 16, 3 h el 17).
      const summary = summarizePeriod(
        [
          closed('2026-10-14T06:00', '2026-10-14T16:00'),
          closed('2026-10-16T06:00', '2026-10-16T20:00'),
          closed('2026-10-17T06:00', '2026-10-17T17:00'),
        ],
        firstHalf,
      );

      expect(summary.hours.overtimeDay).toBe(2);
      expect(summary.weeks.map((w) => [w.weekStart, w.alert])).toEqual([
        ['2026-09-28', false],
        ['2026-10-05', false],
        ['2026-10-12', true],
      ]);
      expect(summary.weeks[2].overtimeHours).toBe(11);
    });
  });
});

describe('alertWindow', () => {
  it('extiende el período a semanas completas', () => {
    expect(alertWindow({ from: '2026-10-01', to: '2026-10-15' })).toEqual({
      from: '2026-09-28',
      to: '2026-10-18',
    });
  });
});

describe('minutesToHours', () => {
  it.each([
    [150, 2.5],
    [20, 0.33],
    [40, 0.67],
    [1, 0.02],
    [0, 0],
  ])('%i min → %d h', (minutes, hours) => {
    expect(minutesToHours(minutes)).toBe(hours);
  });
});
