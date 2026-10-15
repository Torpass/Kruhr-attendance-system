import {
  addDays,
  isLocalDate,
  localDateOf,
  mondayOf,
  periodFor,
  startOfLocalDay,
} from './dates';

describe('fechas locales', () => {
  it('toma la fecha de Caracas, no la de UTC', () => {
    expect(localDateOf(new Date('2026-10-06T03:00:00Z'))).toBe('2026-10-05');
    expect(localDateOf(new Date('2026-10-06T04:00:00Z'))).toBe('2026-10-06');
  });

  it('el día local empieza a las 04:00 UTC', () => {
    expect(startOfLocalDay('2026-10-05').toISOString()).toBe(
      '2026-10-05T04:00:00.000Z',
    );
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it.each([
    ['2026-10-05', '2026-10-05'], // lunes
    ['2026-10-08', '2026-10-05'], // jueves
    ['2026-10-11', '2026-10-05'], // domingo
  ])('el lunes de la semana de %s es %s', (date, monday) => {
    expect(mondayOf(date)).toBe(monday);
  });

  it('valida fechas de calendario', () => {
    expect(isLocalDate('2026-10-05')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('05/10/2026')).toBe(false);
  });
});

describe('periodFor', () => {
  it('semana de lunes a domingo', () => {
    expect(periodFor('week', '2026-10-08')).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('primera quincena: del 1 al 15', () => {
    expect(periodFor('first_half', '2026-10-20')).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
    });
  });

  it.each([
    ['2026-10-02', '2026-10-31'],
    ['2026-02-10', '2026-02-28'],
    ['2028-02-10', '2028-02-29'],
  ])('segunda quincena de %s termina el %s', (date, to) => {
    expect(periodFor('second_half', date)).toEqual({
      from: `${date.slice(0, 7)}-16`,
      to,
    });
  });
});
