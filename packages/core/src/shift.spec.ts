import { computeShift } from './shift';

/** Hora de Caracas (UTC−4) → instante. */
const caracas = (local: string) => new Date(`${local}-04:00`);
const shift = (from: string, to: string) =>
  computeShift({ clockIn: caracas(from), clockOut: caracas(to) });

// 2026-10-05 es lunes.
describe('computeShift', () => {
  describe('ejemplos del enunciado', () => {
    it('Lun 06:00 → 16:00: 10 h, 2 h extra diurna', () => {
      expect(shift('2026-10-05T06:00', '2026-10-05T16:00')).toEqual({
        date: '2026-10-05',
        worked: 600,
        nightOrdinary: 0,
        overtimeDay: 120,
        overtimeNight: 0,
      });
    });

    it('Mar 14:00 → Mié 00:30: 10,5 h, 2,5 h extra nocturna, 3 h nocturna ordinaria', () => {
      expect(shift('2026-10-06T14:00', '2026-10-07T00:30')).toEqual({
        date: '2026-10-06',
        worked: 630,
        nightOrdinary: 180,
        overtimeDay: 0,
        overtimeNight: 150,
      });
    });
  });

  it('turno nocturno 22:00 → 07:00: la extra cruza las 05:00 y es diurna', () => {
    // Ordinarias 22:00–06:00 (nocturnas hasta las 05:00), extra 06:00–07:00.
    expect(shift('2026-10-05T22:00', '2026-10-06T07:00')).toMatchObject({
      worked: 540,
      nightOrdinary: 420,
      overtimeDay: 60,
      overtimeNight: 0,
    });
  });

  it('18:00 → 04:00: la extra es nocturna y la ordinaria cruza las 19:00', () => {
    expect(shift('2026-10-05T18:00', '2026-10-06T04:00')).toMatchObject({
      worked: 600,
      nightOrdinary: 420,
      overtimeDay: 0,
      overtimeNight: 120,
    });
  });

  it('un turno de 8 h exactas no tiene horas extra', () => {
    expect(shift('2026-10-05T09:00', '2026-10-05T17:00')).toMatchObject({
      worked: 480,
      overtimeDay: 0,
      overtimeNight: 0,
    });
  });

  it.each([
    ['termina justo a las 19:00', '2026-10-05T11:00', '2026-10-05T19:00', 0],
    ['empieza justo a las 19:00', '2026-10-05T19:00', '2026-10-05T20:00', 60],
    ['termina justo a las 05:00', '2026-10-06T04:00', '2026-10-06T05:00', 60],
    ['empieza justo a las 05:00', '2026-10-06T05:00', '2026-10-06T06:00', 0],
  ])('la ventana nocturna es [19:00, 05:00): %s', (_caso, from, to, night) => {
    expect(shift(from, to).nightOrdinary).toBe(night);
  });

  it('pertenece al día en que empieza, en hora de Caracas', () => {
    // Domingo 23:30 en Caracas ya es lunes 03:30 en UTC.
    expect(shift('2026-10-11T23:30', '2026-10-12T01:00').date).toBe(
      '2026-10-11',
    );
  });

  it('ignora los segundos de cada marca', () => {
    expect(shift('2026-10-05T06:00:59', '2026-10-05T16:00:30').worked).toBe(
      600,
    );
  });

  it('reparte un turno de 26 h entre dos noches', () => {
    const result = shift('2026-10-05T18:00', '2026-10-06T20:00');
    expect(result).toMatchObject({
      worked: 1560,
      nightOrdinary: 420, // 19:00–02:00
      overtimeNight: 240, // 02:00–05:00 y 19:00–20:00
      overtimeDay: 840, // 05:00–19:00
    });
  });

  it('un turno de cero minutos no suma nada', () => {
    expect(shift('2026-10-05T10:00', '2026-10-05T10:00:45')).toMatchObject({
      worked: 0,
      nightOrdinary: 0,
      overtimeDay: 0,
      overtimeNight: 0,
    });
  });

  it('rechaza una salida anterior a la entrada', () => {
    expect(() => shift('2026-10-05T10:00', '2026-10-05T09:00')).toThrow(
      RangeError,
    );
  });
});
