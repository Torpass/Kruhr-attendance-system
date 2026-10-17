import { compareAttendance } from './attendance';
import { DEFAULT_POLICY, type WorkPolicy } from './schedule';

/** Hora de Caracas (UTC−4) → instante. */
const caracas = (local: string) => new Date(`${local}-04:00`);
const shift = (from: string, to: string | null) => ({
  clockIn: caracas(from),
  clockOut: to ? caracas(to) : null,
});

const office = { start: '08:00', end: '17:00' };
/** L–V 08:00–17:00 con 1 h de almuerzo: 8 h programadas. */
const officePolicy: WorkPolicy = {
  ...DEFAULT_POLICY,
  overtimeMode: 'schedule',
  days: [office, office, office, office, office, null, null],
  breakMinutes: 60,
};

// Semana del lunes 5 al domingo 11 de octubre de 2026, vista el lunes siguiente.
const week = { from: '2026-10-05', to: '2026-10-11' };
const now = caracas('2026-10-12T09:00');
const compare = (
  shifts: ReturnType<typeof shift>[],
  policy = officePolicy,
  at = now,
) => compareAttendance(shifts, week, () => policy, { now: at });
const day = (
  shifts: ReturnType<typeof shift>[],
  date: string,
  policy?: WorkPolicy,
) => compare(shifts, policy).find((d) => d.date === date);

describe('compareAttendance', () => {
  it('a tiempo dentro de la tolerancia de 10 min', () => {
    expect(
      day([shift('2026-10-05T08:07', '2026-10-05T16:55')], '2026-10-05'),
    ).toMatchObject({
      status: 'on_time',
      plannedMinutes: 480,
      lateMinutes: 7,
      leftEarlyMinutes: 5,
    });
  });

  it('tarde, salida anticipada e incompleto', () => {
    expect(
      day([shift('2026-10-05T08:25', '2026-10-05T17:00')], '2026-10-05'),
    ).toMatchObject({
      status: 'late',
      lateMinutes: 25,
    });
    expect(
      day([shift('2026-10-05T08:00', '2026-10-05T16:30')], '2026-10-05'),
    ).toMatchObject({
      status: 'left_early',
      leftEarlyMinutes: 30,
    });
    expect(
      day([shift('2026-10-05T08:20', '2026-10-05T16:00')], '2026-10-05'),
    ).toMatchObject({
      status: 'incomplete',
    });
  });

  it('extendido: llegó antes y se quedó después', () => {
    expect(
      day([shift('2026-10-05T07:00', '2026-10-05T19:00')], '2026-10-05'),
    ).toMatchObject({
      status: 'extended',
      arrivedEarlyMinutes: 60,
      stayedLateMinutes: 120,
      workedMinutes: 660,
      differenceMinutes: 180,
    });
  });

  it('ausente en los días con jornada ya terminada; no lista los días libres sin marcar', () => {
    const days = compare([]);
    expect(days.map((d) => d.status)).toEqual(Array(5).fill('absent'));
    expect(days[0]).toMatchObject({
      date: '2026-10-05',
      differenceMinutes: -480,
    });
  });

  it('hoy, antes de terminar la jornada, está pendiente; los días futuros no aparecen', () => {
    const days = compare([], officePolicy, caracas('2026-10-07T10:00'));
    expect(days.map((d) => [d.date, d.status])).toEqual([
      ['2026-10-05', 'absent'],
      ['2026-10-06', 'absent'],
      ['2026-10-07', 'pending'],
    ]);
  });

  it('turno abierto, día libre trabajado y horario sin jornada fija', () => {
    expect(day([shift('2026-10-05T08:30', null)], '2026-10-05')).toMatchObject({
      status: 'open',
      lateMinutes: 30,
      lastOut: null,
    });
    expect(
      day([shift('2026-10-10T09:00', '2026-10-10T13:00')], '2026-10-10'),
    ).toMatchObject({
      status: 'worked_day_off',
      workedMinutes: 240,
    });
    expect(
      day(
        [shift('2026-10-05T09:00', '2026-10-05T18:00')],
        '2026-10-05',
        DEFAULT_POLICY,
      ),
    ).toMatchObject({
      status: 'unscheduled',
      scheduled: null,
      workedMinutes: 540,
    });
  });

  it('dos turnos el mismo día: primera entrada, última salida y minutos sumados', () => {
    expect(
      day(
        [
          shift('2026-10-05T08:00', '2026-10-05T12:00'),
          shift('2026-10-05T13:00', '2026-10-05T17:00'),
        ],
        '2026-10-05',
      ),
    ).toMatchObject({
      status: 'on_time',
      firstIn: caracas('2026-10-05T08:00'),
      lastOut: caracas('2026-10-05T17:00'),
      workedMinutes: 480,
    });
  });

  it('jornada nocturna: quien entra pasada la medianoche cuenta para la noche anterior', () => {
    const night = { start: '22:00', end: '06:00' };
    const policy: WorkPolicy = {
      ...DEFAULT_POLICY,
      overtimeMode: 'schedule',
      days: [night, night, night, night, night, null, null],
    };
    const monday = day(
      [shift('2026-10-06T00:10', '2026-10-06T06:00')],
      '2026-10-05',
      policy,
    );
    expect(monday).toMatchObject({ status: 'late', lateMinutes: 130 });
  });
});
