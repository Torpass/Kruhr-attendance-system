import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import {
  connectTestDatabase,
  loginStaff,
  seedTenants,
  startApp,
} from './fixtures';

/** Equipo de gestión (admin → admins y analistas de su alcance) y panel del superadmin, contra Postgres real. */
describe('Equipo y superadmin (integración)', () => {
  let app: NestExpressApplication;
  const { client, db } = connectTestDatabase();
  let ids: Awaited<ReturnType<typeof seedTenants>>;
  const agents = {} as Record<
    'superadmin' | 'adminA' | 'analystA' | 'adminB',
    TestAgent
  >;

  beforeAll(async () => {
    ids = await seedTenants(db);
    app = await startApp();
    agents.superadmin = await loginStaff(app, 'super@t.test');
    agents.adminA = await loginStaff(app, 'admin-a@t.test');
    agents.analystA = await loginStaff(app, 'analista-a@t.test');
    agents.adminB = await loginStaff(app, 'admin-b@t.test');
  });

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  const staffUrl = (groupId: string) => `/api/groups/${groupId}/staff`;
  const newAnalyst = (companyIds: string[], email = 'nuevo@t.test') => ({
    name: 'Nuevo Analista',
    email,
    password: 'otra-clave-segura',
    role: 'analyst',
    companyIds,
  });

  describe('equipo del grupo', () => {
    it('el admin ve el equipo de su grupo; los demás reciben 404 o 403', async () => {
      const res = await agents.adminA.get(staffUrl(ids.groupA)).expect(200);
      expect(res.body.staff.map((m: { email: string }) => m.email)).toEqual([
        'admin-a@t.test',
        'analista-a@t.test',
      ]);
      expect(res.body.staff[0]).not.toHaveProperty('passwordHash');

      await agents.adminB.get(staffUrl(ids.groupA)).expect(404);
      await agents.analystA.get(staffUrl(ids.groupA)).expect(403);
      await agents.superadmin.get(staffUrl(ids.groupA)).expect(200);
    });

    it('el admin da de alta analistas con sus empresas, y el analista nuevo entra', async () => {
      const res = await agents.adminA
        .post(staffUrl(ids.groupA))
        .send(newAnalyst([ids.sur]))
        .expect(201);
      expect(res.body.member).toMatchObject({
        role: 'analyst',
        active: true,
        companyIds: [ids.sur],
      });

      const analyst = await loginStaff(
        app,
        'nuevo@t.test',
        'otra-clave-segura',
      );
      const companies = await analyst.get('/api/companies').expect(200);
      expect(
        companies.body.companies.map((c: { name: string }) => c.name),
      ).toEqual(['A Sur']);
    });

    it('el admin crea admins con sus empresas; no asigna empresas que no gestiona o de otro grupo', async () => {
      const created = await agents.adminA
        .post(staffUrl(ids.groupA))
        .send({
          ...newAnalyst([ids.norte], 'admin-nuevo@t.test'),
          role: 'admin',
        })
        .expect(201);
      expect(created.body.member).toMatchObject({
        role: 'admin',
        companyIds: [ids.norte],
      });
      // El admin nuevo entra y gestiona el equipo de su grupo.
      const newAdmin = await loginStaff(
        app,
        'admin-nuevo@t.test',
        'otra-clave-segura',
      );
      await newAdmin.get(staffUrl(ids.groupA)).expect(200);
      // Pero no toca a un admin que gestiona empresas fuera de su alcance (Sur).
      await newAdmin
        .patch(`${staffUrl(ids.groupA)}/${ids.adminA}`)
        .send({ active: false })
        .expect(403);

      await agents.analystA
        .post(staffUrl(ids.groupA))
        .send({ ...newAnalyst([ids.norte], 'x0@t.test'), role: 'admin' })
        .expect(403);
      await agents.adminB
        .post(staffUrl(ids.groupB))
        .send(newAnalyst([ids.norte], 'x2@t.test'))
        .expect(403);
      await agents.superadmin
        .post(staffUrl(ids.groupB))
        .send(newAnalyst([ids.norte], 'x3@t.test'))
        .expect(400);
      await agents.adminA
        .post(staffUrl(ids.groupA))
        .send(newAnalyst([ids.norte], 'admin-b@t.test'))
        .expect(409);
    });

    it('el admin cambia las empresas de un analista y lo desactiva; la sesión del analista cae', async () => {
      const url = `${staffUrl(ids.groupA)}/${ids.analystA}`;
      const moved = await agents.adminA
        .patch(url)
        .send({ companyIds: [ids.norte, ids.sur] })
        .expect(200);
      expect(new Set(moved.body.member.companyIds as string[])).toEqual(
        new Set([ids.norte, ids.sur]),
      );
      await agents.analystA.get(`/api/companies/${ids.sur}/today`).expect(200);

      await agents.adminA.patch(url).send({ active: false }).expect(200);
      await agents.analystA.get('/api/companies').expect(401);
      await agents.adminA.patch(url).send({ active: true }).expect(200);
    });

    it('nadie cambia su propio rol ni se desactiva; el admin asciende a un analista de su alcance', async () => {
      await agents.adminA
        .patch(`${staffUrl(ids.groupA)}/${ids.adminA}`)
        .send({ active: false })
        .expect(400);
      await agents.adminA
        .patch(`${staffUrl(ids.groupA)}/${ids.analystA}`)
        .send({ role: 'admin' })
        .expect(200);
      await agents.adminA
        .patch(`${staffUrl(ids.groupA)}/${ids.analystA}`)
        .send({ role: 'analyst' })
        .expect(200);
      await agents.adminB
        .patch(`${staffUrl(ids.groupB)}/${ids.adminA}`)
        .send({ name: 'Intruso' })
        .expect(404);
    });
  });

  describe('panel del superadmin', () => {
    it('solo el superadmin entra al panel', async () => {
      await agents.adminA.get('/api/admin/groups').expect(403);
      const res = await agents.superadmin.get('/api/admin/groups').expect(200);
      expect(res.body.groups.map((g: { name: string }) => g.name)).toEqual([
        'Grupo A',
        'Grupo B',
      ]);
      expect(res.body.groups[0].companies).toHaveLength(2);
    });

    it('crea un grupo, le suma una empresa y le da un admin', async () => {
      const created = await agents.superadmin
        .post('/api/admin/groups')
        .send({ name: 'Farmacias Ávila' })
        .expect(201);
      const { groupId, companyId } = created.body as {
        groupId: string;
        companyId: string;
      };

      await agents.superadmin
        .post('/api/admin/groups')
        .send({ name: 'Otra', code: 'farmacias-avila' })
        .expect(409);

      const second = await agents.superadmin
        .post(`/api/admin/groups/${groupId}/companies`)
        .send({ name: 'Farmacias Ávila Este', rif: 'J-12345678-9' })
        .expect(201);
      expect(second.body.company).toMatchObject({
        slug: 'farmacias-avila-este',
        rif: 'J-12345678-9',
      });

      await agents.superadmin
        .post(staffUrl(groupId))
        .send({
          name: 'Admin Ávila',
          email: 'admin@avila.test',
          password: 'clave-avila-segura',
          role: 'admin',
          companyIds: [companyId, second.body.company.id],
        })
        .expect(201);
      const admin = await loginStaff(
        app,
        'admin@avila.test',
        'clave-avila-segura',
      );
      const companies = await admin.get('/api/companies').expect(200);
      expect(companies.body.companies).toHaveLength(2);

      // Desactivar una empresa la saca de la sesión de su admin.
      await agents.superadmin
        .patch(`/api/admin/companies/${companyId}`)
        .send({ active: false })
        .expect(200);
      const after = await admin.get('/api/companies').expect(200);
      expect(after.body.companies.map((c: { name: string }) => c.name)).toEqual(
        ['Farmacias Ávila Este'],
      );
    });

    it('valida el RIF y responde 404 en grupos o empresas que no existen', async () => {
      await agents.superadmin
        .post(`/api/admin/groups/${ids.groupA}/companies`)
        .send({ name: 'Mal RIF', rif: '123' })
        .expect(400);
      await agents.superadmin
        .post(
          '/api/admin/groups/00000000-0000-4000-8000-000000000000/companies',
        )
        .send({ name: 'Huérfana' })
        .expect(404);
      await request(app.getHttpServer()).get('/api/admin/groups').expect(401);
    });
  });
});
