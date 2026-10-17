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

/**
 * Horarios contra Postgres real: CRUD del grupo, asignación en el contrato y cálculo de los
 * turnos y del período con el horario vigente.
 */
describe('Horarios (integración)', () => {
  let app: NestExpressApplication;
  const { client, db } = connectTestDatabase();
  let ids: Awaited<ReturnType<typeof seedTenants>>;
  const agents = {} as Record<'adminA' | 'adminB', TestAgent>;
  let scheduleId: string;
  let structureId: string;

  beforeAll(async () => {
    ids = await seedTenants(db);
    app = await startApp();
    agents.adminA = await loginStaff(app, 'admin-a@t.test');
    agents.adminB = await loginStaff(app, 'admin-b@t.test');

    // Lunes 5 de octubre, 07:00–19:00: 12 h.
    await db.insert(schema.shifts).values({
      companyId: ids.norte,
      employeeId: ids.luis,
      clockIn: caracas('2026-10-05T07:00'),
      clockOut: caracas('2026-10-05T19:00'),
    });
    const res = await agents.adminA
      .post(`/api/groups/${ids.groupA}/structures`)
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
    structureId = res.body.structure.id;
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  const schedules = (path = '') => `/api/groups/${ids.groupA}/schedules${path}`;
  const company = (path: string) => `/api/companies/${ids.norte}/${path}`;
  const luisShift = async () => {
    const res = await agents.adminA
      .get(
        company(`shifts?from=2026-10-05&to=2026-10-05&employeeId=${ids.luis}`),
      )
      .expect(200);
    return res.body.shifts[0].minutes;
  };
  const luisPeriod = async () => {
    const res = await agents.adminA
      .get(company('periods?from=2026-10-05&to=2026-10-05'))
      .expect(200);
    return res.body.rows.find(
      (row: { employee: { id: string } }) => row.employee.id === ids.luis,
    ).hours;
  };

  it('crea un horario con los valores por defecto donde no se indican', async () => {
    const res = await agents.adminA
      .post(schedules())
      .send({
        code: 'OFICINA',
        name: 'Oficina L–V',
        overtimeMode: 'schedule',
        days: [office, office, office, office, office, null, null],
        breakMinutes: 60,
      })
      .expect(201);
    scheduleId = res.body.schedule.id;
    expect(res.body.schedule).toMatchObject({
      overtimeMode: 'schedule',
      ordinaryMinutes: 480,
      breakMinutes: 60,
      nightStart: '19:00',
      nightEnd: '05:00',
      weeklyOvertimeAlertMinutes: 600,
      active: true,
    });

    const list = await agents.adminA.get(schedules()).expect(200);
    expect(list.body.schedules).toHaveLength(1);
  });

  it('rechaza políticas inconsistentes, códigos repetidos y otros grupos', async () => {
    const noDays = await agents.adminA
      .post(schedules())
      .send({ code: 'MALO', name: 'Malo', overtimeMode: 'schedule' })
      .expect(400);
    expect(JSON.stringify(noDays.body)).toContain('7 días');

    await agents.adminA
      .post(schedules())
      .send({ code: 'OFICINA', name: 'Otro' })
      .expect(409);

    // La política combinada con lo guardado también se valida al editar.
    const edit = await agents.adminA
      .patch(schedules(`/${scheduleId}`))
      .send({ days: null })
      .expect(400);
    expect(JSON.stringify(edit.body)).toContain('7 días');

    await agents.adminB.get(schedules()).expect(404);
  });

  it('sin horario en el contrato, el turno usa la regla del enunciado', async () => {
    // 8 h ordinarias (07–15) y 4 h extra diurnas (15–19).
    expect(await luisShift()).toMatchObject({
      worked: 720,
      overtimeDay: 240,
      overtimeNight: 0,
    });
  });

  it('con el horario en el contrato, turnos y período usan la jornada programada', async () => {
    const res = await agents.adminA
      .post(company(`employees/${ids.luis}/contracts`))
      .send({ structureId, scheduleId, wage: 1000, dateStart: '2026-10-01' })
      .expect(201);
    expect(res.body.contracts[0].schedule).toEqual({
      id: scheduleId,
      name: 'Oficina L–V',
    });

    // Jornada 08–17 menos 1 h de descanso = 8 h; extra 07–08 y 17–19.
    expect(await luisShift()).toMatchObject({
      worked: 660,
      overtimeDay: 180,
      overtimeNight: 0,
    });
    expect(await luisPeriod()).toMatchObject({ worked: 11, overtimeDay: 3 });
  });

  it('editar el horario recalcula el período', async () => {
    await agents.adminA
      .patch(schedules(`/${scheduleId}`))
      .send({ overtimeMode: 'duration', ordinaryMinutes: 600 })
      .expect(200);
    // 10 h ordinarias más 1 h de descanso: la extra empieza a las 18:00.
    expect(await luisPeriod()).toMatchObject({ worked: 11, overtimeDay: 1 });
  });

  it('no asigna horarios inactivos ni de otro grupo', async () => {
    await agents.adminA
      .patch(schedules(`/${scheduleId}`))
      .send({ active: false })
      .expect(200);
    const inactive = await agents.adminA
      .post(company(`employees/${ids.ana}/contracts`))
      .send({ structureId, scheduleId, wage: 1000, dateStart: '2026-10-01' })
      .expect(400);
    expect(inactive.body.message).toContain('inactivo');

    const other = await agents.adminB
      .post(`/api/groups/${ids.groupB}/schedules`)
      .send({ code: 'B', name: 'Horario B' })
      .expect(201);
    await agents.adminA
      .post(company(`employees/${ids.ana}/contracts`))
      .send({
        structureId,
        scheduleId: other.body.schedule.id,
        wage: 1000,
        dateStart: '2026-10-01',
      })
      .expect(404);
  });

  it('cambia de horario desde una fecha sin tocar los días anteriores', async () => {
    const contracts = company(`employees/${ids.luis}/contracts`);
    const list = await agents.adminA.get(contracts).expect(200);
    const current = list.body.contracts[0];

    // Un horario inactivo no se asigna.
    await agents.adminA
      .post(`${contracts}/${current.id}/schedule`)
      .send({ scheduleId, dateFrom: '2026-10-06' })
      .expect(400);

    const res = await agents.adminA
      .post(`${contracts}/${current.id}/schedule`)
      .send({ scheduleId: null, dateFrom: '2026-10-06' })
      .expect(201);
    expect(res.body.contracts).toMatchObject([
      { dateStart: '2026-10-06', dateEnd: null, schedule: null },
      {
        dateStart: '2026-10-01',
        dateEnd: '2026-10-05',
        schedule: { id: scheduleId },
      },
    ]);
    // El lunes 5 sigue con el horario que tenía (10 h + 1 h de descanso).
    expect(await luisPeriod()).toMatchObject({ worked: 11, overtimeDay: 1 });

    // La fecha no puede ser anterior al inicio del contrato.
    await agents.adminA
      .post(`${contracts}/${res.body.contracts[0].id}/schedule`)
      .send({ scheduleId: null, dateFrom: '2026-10-05' })
      .expect(400);
  });

  it('cambiar el horario desde el inicio del contrato no lo parte; se corrige el inicio y se borra', async () => {
    const contracts = company(`employees/${ids.luis}/contracts`);
    const before = await agents.adminA.get(contracts).expect(200);
    const [current, first] = before.body.contracts as { id: string }[];

    // En la fecha de inicio cambia el horario de ese mismo contrato.
    const same = await agents.adminA
      .post(`${contracts}/${first.id}/schedule`)
      .send({ scheduleId: null, dateFrom: '2026-10-01' })
      .expect(201);
    expect(same.body.contracts).toHaveLength(2);
    expect(same.body.contracts[1]).toMatchObject({
      id: first.id,
      dateStart: '2026-10-01',
      schedule: null,
    });

    // Adelantar el inicio sobre otro contrato se solapa; borrado el otro, sí se puede.
    await agents.adminA
      .patch(`${contracts}/${current.id}`)
      .send({ dateStart: '2026-10-01' })
      .expect(409);
    await agents.adminA.delete(`${contracts}/${first.id}`).expect(200);
    const fixed = await agents.adminA
      .patch(`${contracts}/${current.id}`)
      .send({ dateStart: '2026-10-01' })
      .expect(200);
    expect(fixed.body.contracts).toMatchObject([
      { id: current.id, dateStart: '2026-10-01', dateEnd: null },
    ]);
  });
});
