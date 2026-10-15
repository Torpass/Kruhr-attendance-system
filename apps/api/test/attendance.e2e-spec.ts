import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import * as schema from '../src/database/schema';
import {
  connectTestDatabase,
  loginEmployee,
  loginStaff,
  seedTenants,
  startApp,
} from './fixtures';

/**
 * Integración contra Postgres real: autorización por rol y por empresa, marcaje,
 * correcciones, ver el día, período y CSV. Requiere `pnpm db:up` (o TEST_DATABASE_URL).
 */
const caracas = (local: string) => new Date(`${local}-04:00`);

describe('Asistencia (integración)', () => {
  let app: NestExpressApplication;
  const { client, db } = connectTestDatabase();
  let ids: Awaited<ReturnType<typeof seedTenants>>;
  const agents = {} as Record<
    'superadmin' | 'adminA' | 'analystA' | 'adminB' | 'ana' | 'luis',
    TestAgent
  >;

  beforeAll(async () => {
    ids = await seedTenants(db);
    app = await startApp();
    agents.superadmin = await loginStaff(app, 'super@t.test');
    agents.adminA = await loginStaff(app, 'admin-a@t.test');
    agents.analystA = await loginStaff(app, 'analista-a@t.test');
    agents.adminB = await loginStaff(app, 'admin-b@t.test');
    agents.ana = await loginEmployee(app, '12345678', ids.norte);
    agents.luis = await loginEmployee(app, '87654321');
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  describe('aislamiento entre empresas', () => {
    it('cada quien ve solo sus empresas', async () => {
      const names = async (agent: TestAgent) =>
        (await agent.get('/api/companies').expect(200)).body.companies.map(
          (c: { name: string }) => c.name,
        );
      expect(await names(agents.adminA)).toEqual(['A Norte', 'A Sur']);
      expect(await names(agents.analystA)).toEqual(['A Norte']);
      expect(await names(agents.adminB)).toEqual(['B']);
      expect(await names(agents.superadmin)).toEqual(['A Norte', 'A Sur', 'B']);
    });

    it.each([
      ['employees', 'get'],
      ['today', 'get'],
      ['shifts?from=2026-10-01&to=2026-10-15', 'get'],
      ['periods?kind=week&date=2026-10-07', 'get'],
      ['periods/export.csv?kind=week&date=2026-10-07', 'get'],
    ] as const)(
      'el admin de B recibe 404 en /companies/<A>/%s',
      async (path, method) => {
        await agents.adminB[method](
          `/api/companies/${ids.norte}/${path}`,
        ).expect(404);
      },
    );

    it('el analista no entra a una empresa de su grupo que no tiene asignada', async () => {
      await agents.analystA
        .get(`/api/companies/${ids.sur}/employees`)
        .expect(404);
    });

    it('un id de empresa inválido o inexistente es 404, también para el superadmin', async () => {
      await agents.superadmin
        .get('/api/companies/no-es-uuid/today')
        .expect(404);
      await agents.superadmin
        .get('/api/companies/00000000-0000-4000-8000-000000000000/today')
        .expect(404);
      await agents.superadmin.get(`/api/companies/${ids.b}/today`).expect(200);
    });

    it('el colaborador no entra a las rutas de RRHH, ni RRHH a las del colaborador', async () => {
      await agents.ana.get(`/api/companies/${ids.norte}/today`).expect(403);
      await agents.ana.get('/api/companies').expect(403);
      await agents.adminA.post('/api/me/clock-in').expect(403);
      await agents.superadmin.get('/api/me/today').expect(403);
    });

    it('no se puede corregir un turno de A a través de la empresa B', async () => {
      const [shift] = await db
        .insert(schema.shifts)
        .values({
          companyId: ids.norte,
          employeeId: ids.luis,
          clockIn: caracas('2026-09-01T08:00'),
          clockOut: caracas('2026-09-01T12:00'),
        })
        .returning();
      await agents.adminB
        .patch(`/api/companies/${ids.b}/shifts/${shift.id}`)
        .send({
          clockOut: caracas('2026-09-01T13:00').toISOString(),
          reason: 'Intento ajeno',
        })
        .expect(404);
      await db.delete(schema.shifts).where(sql`id = ${shift.id}`);
    });
  });

  describe('colaboradores', () => {
    it('el analista da de alta, pero editar es del admin', async () => {
      const created = await agents.analystA
        .post(`/api/companies/${ids.norte}/employees`)
        .send({ name: 'Carla Díaz', cedula: 'V-22.333.444', pin: '1234' })
        .expect(201);
      expect(created.body.employee).toMatchObject({
        cedula: '22333444',
        active: true,
      });
      expect(created.body.employee).not.toHaveProperty('pinHash');

      const id = created.body.employee.id as string;
      await agents.analystA
        .patch(`/api/companies/${ids.norte}/employees/${id}`)
        .send({ active: false })
        .expect(403);
      await agents.adminA
        .patch(`/api/companies/${ids.norte}/employees/${id}`)
        .send({ active: false })
        .expect(200);
    });

    it('rechaza una cédula repetida en la misma empresa y nombres que parecen fórmulas', async () => {
      await agents.adminA
        .post(`/api/companies/${ids.norte}/employees`)
        .send({ name: 'Otra Ana', cedula: '12345678', pin: '1234' })
        .expect(409);
      await agents.adminA
        .post(`/api/companies/${ids.norte}/employees`)
        .send({ name: '=HYPERLINK("x")', cedula: '33444555', pin: '1234' })
        .expect(400);
    });
  });

  describe('marcar', () => {
    afterAll(() =>
      db.execute(sql`delete from shifts where employee_id = ${ids.ana}`),
    );

    it('entrada → hoy → salida, con la hora del servidor', async () => {
      const before = Date.now();
      const opened = await agents.ana.post('/api/me/clock-in').expect(201);
      const clockIn = Date.parse(opened.body.shift.clockIn as string);
      expect(clockIn).toBeGreaterThanOrEqual(before - 1000);
      expect(clockIn).toBeLessThanOrEqual(Date.now() + 1000);

      await agents.ana.post('/api/me/clock-in').expect(409);

      const today = await agents.ana.get('/api/me/today').expect(200);
      expect(today.body.openShift).toMatchObject({ minutes: null });

      const inside = await agents.adminA
        .get(`/api/companies/${ids.norte}/today`)
        .expect(200);
      expect(
        inside.body.inside.map(
          (s: { employee: { name: string } }) => s.employee.name,
        ),
      ).toEqual(['Ana Pérez']);
      expect(
        inside.body.notClockedIn.map((e: { name: string }) => e.name),
      ).toContain('Luis Gil');

      const closed = await agents.ana.post('/api/me/clock-out').expect(200);
      expect(closed.body.shift.clockOut).not.toBeNull();
      await agents.ana.post('/api/me/clock-out').expect(409);
    });

    it('un turno olvidado de más de 16 h queda "sin salida" y no se cierra marcando', async () => {
      // Un turno abierto desde hace 20 h chocaría (EXCLUDE) con el turno del test anterior.
      await db.execute(sql`delete from shifts where employee_id = ${ids.ana}`);
      await db.insert(schema.shifts).values({
        companyId: ids.norte,
        employeeId: ids.ana,
        clockIn: new Date(Date.now() - 20 * 3_600_000),
      });

      await agents.ana.post('/api/me/clock-out').expect(409);
      await agents.ana.post('/api/me/clock-in').expect(409);
      const today = await agents.adminA
        .get(`/api/companies/${ids.norte}/today`)
        .expect(200);
      expect(today.body.counts.missingClockOut).toBe(1);
      expect(today.body.inside).toHaveLength(0);
    });
  });

  describe('corregir y calcular el período', () => {
    let monday: string;

    it('RRHH crea turnos manuales con motivo', async () => {
      const create = (clockIn: string, clockOut: string) =>
        agents.analystA.post(`/api/companies/${ids.norte}/shifts`).send({
          employeeId: ids.luis,
          clockIn: caracas(clockIn).toISOString(),
          clockOut: caracas(clockOut).toISOString(),
          reason: 'Olvidó marcar',
        });

      const res = await create('2026-10-05T06:00', '2026-10-05T16:00').expect(
        201,
      );
      monday = res.body.shift.id as string;
      expect(res.body.shift.minutes).toMatchObject({ overtimeDay: 120 });
      await create('2026-10-06T14:00', '2026-10-07T00:30').expect(201);

      // Se solapa con el turno del martes.
      await create('2026-10-06T20:00', '2026-10-06T23:00').expect(409);
      // Colaborador de otra empresa.
      await agents.analystA
        .post(`/api/companies/${ids.norte}/shifts`)
        .send({
          employeeId: ids.bea,
          clockIn: caracas('2026-10-05T08:00').toISOString(),
          clockOut: caracas('2026-10-05T09:00').toISOString(),
          reason: 'Prueba ajena',
        })
        .expect(404);
    });

    it('la corrección exige motivo, horas válidas y deja historial', async () => {
      const url = `/api/companies/${ids.norte}/shifts/${monday}`;
      await agents.adminA
        .patch(url)
        .send({ clockOut: caracas('2026-10-05T17:00').toISOString() })
        .expect(400);
      await agents.adminA
        .patch(url)
        .send({
          clockOut: caracas('2026-10-05T05:00').toISOString(),
          reason: 'Salida antes',
        })
        .expect(400);
      await agents.adminA
        .patch(url)
        .send({
          clockOut: new Date(Date.now() + 3_600_000).toISOString(),
          reason: 'Futuro',
        })
        .expect(400);

      const corrected = await agents.adminA
        .patch(url)
        .send({
          clockOut: caracas('2026-10-05T17:00').toISOString(),
          reason: 'Salió más tarde',
        })
        .expect(200);
      expect(corrected.body.shift.minutes.overtimeDay).toBe(180);

      const history = await agents.adminA.get(`${url}/corrections`).expect(200);
      expect(history.body.corrections[0]).toMatchObject({
        reason: 'Salió más tarde',
        correctedBy: { name: 'Admin A' },
        after: { clockOut: caracas('2026-10-05T17:00').toISOString() },
      });

      // Volver a los valores del enunciado para el período.
      await agents.adminA
        .patch(url)
        .send({
          clockOut: caracas('2026-10-05T16:00').toISOString(),
          reason: 'Revertir prueba',
        })
        .expect(200);
    });

    it('el período reproduce los ejemplos del enunciado y el CSV', async () => {
      const res = await agents.analystA
        .get(`/api/companies/${ids.norte}/periods?kind=week&date=2026-10-07`)
        .expect(200);
      expect(res.body.period).toEqual({ from: '2026-10-05', to: '2026-10-11' });
      const luis = res.body.rows.find(
        (row: { employee: { cedula: string } }) =>
          row.employee.cedula === '87654321',
      );
      expect(luis.hours).toEqual({
        worked: 20.5,
        overtimeDay: 2,
        overtimeNight: 2.5,
        nightOrdinary: 3,
      });

      const csv = await agents.analystA
        .get(
          `/api/companies/${ids.norte}/periods/export.csv?from=2026-10-05&to=2026-10-11`,
        )
        .expect(200)
        .expect('Content-Type', /text\/csv/);
      expect(csv.text).toContain(
        '87654321;Luis Gil;2026-10-05;2026-10-11;2.00;2.50;3.00',
      );
      // Una fila por colaborador activo, incluidos los que tienen 0 h; los inactivos sin horas no salen.
      expect(csv.text).toContain(
        '12345678;Ana Pérez;2026-10-05;2026-10-11;0.00;0.00;0.00',
      );
      expect(csv.text).not.toContain('Carla Díaz');
    });

    it('valida el rango del período', async () => {
      await agents.analystA
        .get(
          `/api/companies/${ids.norte}/periods?from=2026-10-15&to=2026-10-01`,
        )
        .expect(400);
      await agents.analystA
        .get(
          `/api/companies/${ids.norte}/periods?from=2026-01-01&to=2026-06-01`,
        )
        .expect(400);
    });
  });

  describe('registro público', () => {
    it('crea grupo, empresa y admin, y abre la sesión', async () => {
      const agent = request.agent(app.getHttpServer());
      const res = await agent
        .post('/api/auth/register')
        .send({
          companyName: 'Panadería Ávila',
          name: 'Rosa Mora',
          email: 'rosa@avila.test',
          password: 'clave-muy-segura',
        })
        .expect(201);
      expect(res.body.user).toMatchObject({
        role: 'admin',
        email: 'rosa@avila.test',
      });

      const companies = await agent.get('/api/companies').expect(200);
      expect(companies.body.companies).toEqual([
        expect.objectContaining({
          name: 'Panadería Ávila',
          slug: 'panaderia-avila',
        }),
      ]);
    });

    it('rechaza un código de empresa o un correo repetidos', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          companyName: 'Otra',
          companyCode: 'panaderia-avila',
          name: 'Otro Admin',
          email: 'otro@avila.test',
          password: 'clave-muy-segura',
        })
        .expect(409);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          companyName: 'Tercera',
          name: 'Otro Admin',
          email: 'rosa@avila.test',
          password: 'clave-muy-segura',
        })
        .expect(409);
    });
  });
});
