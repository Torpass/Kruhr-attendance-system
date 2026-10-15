import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { DB, PG_CLIENT } from '../src/database/database.constants';

describe('Auth y health (e2e)', () => {
  let app: NestExpressApplication;
  const db = { execute: jest.fn().mockResolvedValue([]) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_CLIENT)
      .useValue({ end: jest.fn() })
      .overrideProvider(DB)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app, app.get(ConfigService));
    await app.init();
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

  it('valida el cuerpo del login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'no-es-correo', password: '' })
      .expect(400);
  });

  it('login → cookie httpOnly → /me → logout', async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'DEMO@marcaje.test', password: 'clave-segura' })
      .expect(200);
    expect(login.headers['set-cookie']?.[0]).toMatch(
      /^marcaje_session=.+HttpOnly.+SameSite=Lax/,
    );

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toEqual({
      user: {
        sub: 'demo',
        email: 'demo@marcaje.test',
        name: 'Usuario demo',
        role: 'superadmin',
      },
    });

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rechaza credenciales incorrectas', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'demo@marcaje.test', password: 'mala' })
      .expect(401);
  });
});
