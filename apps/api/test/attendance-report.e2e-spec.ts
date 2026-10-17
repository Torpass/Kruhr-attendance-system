import type { NestExpressApplication } from '@nestjs/platform-express';
import type TestAgent from 'supertest/lib/agent';
import * as schema from '../src/database/schema';
import {
  connectTestDatabase,
  loginStaff,
  seedTenants,
  startApp,
} from './fixtures';

const caracas = (local: string) => new Date(`${local}-04:00`);
const office = { start: '08:00', end: '17:00' };

type Day = {
  date: string;
  status: string;
  lateMinutes: number;
  differenceMinutes: number;
  corrected: boolean;
  employee: { id: string };
};

/** Horario contra marcajes: el horario del contrato decide qué se compara. */
describe('Control de horario (integración)', () => {
  let app: NestExpressApplication;
  const { client, db } = connectTestDatabase();
  let ids: Awaited<ReturnType<typeof seedTenants>>;
  const agents = {} as Record<'analystA' | 'adminB', TestAgent>;

  beforeAll(async () => {
    ids = await seedTenants(db);
    app = await startApp();
    agents.analystA = await loginStaff(app, 'analista-a@t.test');
    agents.adminB = await loginStaff(app, 'admin-b@t.test');

    const group = `/api/groups/${ids.groupA}`;
    const structure = await agents.analystA
      .post(`${group}/structures`)
      .send({
        code: 'BASE',
        name: 'Base',
        schedulePay: 'semi_monthly',
        rules: [
          {
            code: 'BASIC',
            name: 'Salario',
            sequence: 10,
            amountType: 'monthly_wage',
            rate: 50,
          },
        ],
      })
      .expect(201);
    const schedule = await agents.analystA
      .post(`${group}/schedules`)
      .send({
        code: 'OFICINA',
        name: 'Oficina',
        overtimeMode: 'schedule',
        days: [office, office, office, office, office, null, null],
        breakMinutes: 60,
      })
      .expect(201);
    await agents.analystA
      .post(`/api/companies/${ids.norte}/employees/${ids.luis}/contracts`)
      .send({
        structureId: structure.body.structure.id,
        scheduleId: schedule.body.schedule.id,
        wage: 1000,
        dateStart: '2026-10-01',
      })
      .expect(201);

    await db.insert(schema.shifts).values(
      [
        // Luis (horario de oficina): tarde el lunes, falta el martes, se queda el miércoles.
        { from: '2026-10-05T08:25', to: '2026-10-05T17:00' },
        { from: '2026-10-07T07:00', to: '2026-10-07T19:00' },
        { from: '2026-10-08T08:00', to: '2026-10-08T17:00' },
        { from: '2026-10-09T08:00', to: '2026-10-09T17:00' },
        { from: '2026-10-10T09:00', to: '2026-10-10T13:00' },
      ].map(({ from, to }) => ({
        companyId: ids.norte,
        employeeId: ids.luis,
        clockIn: caracas(from),
        clockOut: caracas(to),
      })),
    );
    // Ana no tiene horario: sus marcajes no se comparan.
    await db.insert(schema.shifts).values({
      companyId: ids.norte,
      employeeId: ids.ana,
      clockIn: caracas('2026-10-05T09:00'),
      clockOut: caracas('2026-10-05T18:00'),
    });
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  const url = () =>
    `/api/companies/${ids.norte}/periods/attendance?from=2026-10-05&to=2026-10-11`;

  it('compara cada día con la jornada del horario del contrato', async () => {
    const res = await agents.analystA.get(url()).expect(200);
    const days = res.body.days as Day[];
    const luis = days.filter((d) => d.employee.id === ids.luis);
    expect(luis.map((d) => [d.date, d.status])).toEqual([
      ['2026-10-05', 'late'],
      ['2026-10-06', 'absent'],
      ['2026-10-07', 'extended'],
      ['2026-10-08', 'on_time'],
      ['2026-10-09', 'on_time'],
      ['2026-10-10', 'worked_day_off'],
    ]);
    expect(luis[0]).toMatchObject({ lateMinutes: 25, corrected: false });
    expect(luis[1]).toMatchObject({ differenceMinutes: -480 });

    const ana = days.filter((d) => d.employee.id === ids.ana);
    expect(ana).toMatchObject([{ date: '2026-10-05', status: 'unscheduled' }]);
    expect(res.body.counts).toMatchObject({
      late: 1,
      absent: 1,
      extended: 1,
      on_time: 2,
      worked_day_off: 1,
      unscheduled: 1,
    });
  });

  it('otra empresa no ve el control de horario', async () => {
    await agents.adminB.get(url()).expect(404);
  });
});
