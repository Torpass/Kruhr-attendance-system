import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { AuthRepository } from '../src/auth/auth.repository';
import { hashSecret } from '../src/auth/password';
import type { SessionUser } from '../src/common/auth/session';
import { DB, PG_CLIENT } from '../src/database/database.constants';

const STAFF_ID = '0b7f6a3e-7c1d-4b8e-9a51-2f4c6d8e0a11';
const EMPLOYEE_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f022';
const EMPLOYEE_SUR_ID = '5d2c9e41-3a7b-4f60-8c2d-91e4b6a7f099';
const NORTE = { id: '7a1c2e3d-0000-4000-8000-000000000001', name: 'A Norte' };
const SUR = { id: '7a1c2e3d-0000-4000-8000-000000000002', name: 'A Sur' };

const staff: SessionUser = {
  kind: 'staff',
  id: STAFF_ID,
  role: 'admin',
  name: 'Admin A',
  email: 'admin@empresa-a.test',
  groupId: 'g-a',
  companyIds: ['c-norte'],
};
const employee: SessionUser = {
  kind: 'employee',
  id: EMPLOYEE_ID,
  role: 'employee',
  name: 'Ana Pérez',
  cedula: '12345678',
  companyName: NORTE.name,
  groupId: 'g-a',
  companyIds: [NORTE.id],
};
const employeeSur: SessionUser = {
  ...employee,
  id: EMPLOYEE_SUR_ID,
  companyName: SUR.name,
  companyIds: [SUR.id],
};

describe('Auth y health (e2e)', () => {
  let app: NestExpressApplication;
  const db = { execute: jest.fn().mockResolvedValue([]) };
  // Repositorio en memoria: el e2e prueba guard, pipes, cookies y throttling sin base de datos.
  const sessions = new Map<string, SessionUser>();
  const repo: Record<keyof AuthRepository, jest.Mock> = {
    findStaffCredentials: jest.fn(),
    findEmployeeCredentials: jest.fn(),
    findStaffSession: jest.fn((id: string) => sessions.get(id)),
    findEmployeeSession: jest.fn((id: string) => sessions.get(id)),
  };

  beforeAll(async () => {
    const [passwordHash, pinHash] = await Promise.all([
      hashSecret('clave-segura'),
      hashSecret('4321'),
    ]);
    repo.findStaffCredentials.mockImplementation((email: string) =>
      email === staff.email ? { id: STAFF_ID, passwordHash } : undefined,
    );
    // Ana trabaja en dos empresas del grupo A, con el mismo PIN.
    repo.findEmployeeCredentials.mockImplementation((cedula: string) =>
      cedula === employee.cedula
        ? [
            { id: EMPLOYEE_ID, pinHash, company: NORTE },
            { id: EMPLOYEE_SUR_ID, pinHash, company: SUR },
          ]
        : [],
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_CLIENT)
      .useValue({ end: jest.fn() })
      .overrideProvider(DB)
      .useValue(db)
      .overrideProvider(AuthRepository)
      .useValue(repo)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app, app.get(ConfigService));
    await app.init();
  });

  beforeEach(() => {
    sessions.set(STAFF_ID, staff);
    sessions.set(EMPLOYEE_ID, employee);
    sessions.set(EMPLOYEE_SUR_ID, employeeSur);
  });

  afterAll(() => app.close());

  it('GET /api/health responde ok cuando la base contesta', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok', db: 'up' });
  });

  it('GET /api/health responde 503 cuando la base falla', async () => {
    db.execute.mockRejectedValueOnce(new Error('sin conexión'));
    await request(app.getHttpServer()).get('/api/health').expect(503);
  });

  it('GET /api/auth/me exige sesión', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('valida el cuerpo de ambos logins', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/staff/login')
      .send({ email: 'no-es-correo', password: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/employee/login')
      .send({ cedula: 'abc', pin: '12', companyId: 'no-es-uuid' })
      .expect(400);
  });

  it('staff: login → cookie httpOnly → /me → logout', async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post('/api/auth/staff/login')
      .send({ email: 'ADMIN@empresa-a.test', password: 'clave-segura' })
      .expect(200);
    expect(login.headers['set-cookie']?.[0]).toMatch(
      /^marcaje_session=.+HttpOnly.+SameSite=Lax/,
    );

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toEqual({ user: staff });

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('colaborador en varias empresas: elige la empresa y entra', async () => {
    const agent = request.agent(app.getHttpServer());

    const choice = await agent
      .post('/api/auth/employee/login')
      .send({ cedula: 'V-12.345.678', pin: '4321' })
      .expect(200, { companies: [NORTE, SUR] });
    expect(choice.headers['set-cookie']).toBeUndefined();
    await agent.get('/api/auth/me').expect(401);

    await agent
      .post('/api/auth/employee/login')
      .send({ cedula: '12345678', pin: '4321', companyId: SUR.id })
      .expect(200, { user: employeeSur });
    await agent.get('/api/auth/me').expect(200, { user: employeeSur });
  });

  it('rechaza credenciales incorrectas', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'mala' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/employee/login')
      .send({ cedula: '12345678', pin: '0000' })
      .expect(401);
  });

  it('una sesión deja de valer cuando la persona se desactiva', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/staff/login')
      .send({ email: staff.email, password: 'clave-segura' })
      .expect(200);

    sessions.delete(STAFF_ID);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rechaza tokens firmados con otra forma (login provisional)', async () => {
    const legacy = await app
      .get(JwtService)
      .signAsync({ sub: 'demo', role: 'superadmin' });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `marcaje_session=${legacy}`)
      .expect(401);
  });

  it('limita los intentos por cédula a 5 por minuto', async () => {
    // Cambiar el formato de la cédula no reinicia el contador.
    const attempt = (cedula: string) =>
      request(app.getHttpServer())
        .post('/api/auth/employee/login')
        .send({ cedula, pin: '0000' });

    for (const cedula of ['99999999', 'V-99.999.999', '99.999.999'])
      await attempt(cedula).expect(401);
    for (const cedula of ['V99999999', '99999999'])
      await attempt(cedula).expect(401);
    await attempt('E-99999999').expect(429);
  });
});
