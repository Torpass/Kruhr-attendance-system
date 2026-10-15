import { periodToCsv } from './csv';

const period = { from: '2026-10-05', to: '2026-10-11' };

describe('periodToCsv', () => {
  it('reproduce el formato del enunciado', () => {
    const csv = periodToCsv(
      [
        {
          cedula: '12345678',
          name: 'Ana Pérez',
          hours: { overtimeDay: 2, overtimeNight: 2.5, nightOrdinary: 3 },
        },
      ],
      period,
    );
    expect(csv).toBe(
      'cedula;nombre;periodo_desde;periodo_hasta;overtimeDayHours;overtimeNightHours;nightShiftHours\n' +
        '12345678;Ana Pérez;2026-10-05;2026-10-11;2.00;2.50;3.00\n',
    );
  });

  it('incluye a los colaboradores con 0 h', () => {
    const csv = periodToCsv(
      [
        {
          cedula: '87654321',
          name: 'Luis Gil',
          hours: { overtimeDay: 0, overtimeNight: 0, nightOrdinary: 0 },
        },
      ],
      period,
    );
    expect(csv.split('\n')[1]).toBe(
      '87654321;Luis Gil;2026-10-05;2026-10-11;0.00;0.00;0.00',
    );
  });

  it('entrecomilla los valores con separador o comillas', () => {
    const csv = periodToCsv(
      [
        {
          cedula: '11111111',
          name: 'Pérez; "Ana"',
          hours: { overtimeDay: 1, overtimeNight: 0, nightOrdinary: 0 },
        },
      ],
      period,
    );
    expect(csv.split('\n')[1]).toBe(
      '11111111;"Pérez; ""Ana""";2026-10-05;2026-10-11;1.00;0.00;0.00',
    );
  });
});
