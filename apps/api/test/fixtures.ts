import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { hashSecret } from '../src/auth/password';
import * as schema from '../src/database/schema';
import { TEST_DATABASE_URL } from './test-database';

/**
 * Datos y helpers de los e2e de integración (Postgres real, base `marcaje_test`).
 * Grupo A (A Norte, A Sur), grupo B (B), superadmin, admins A y B, analista A (solo Norte),
 * Ana (Norte y Sur), Luis (Norte) y Bea (B). Todas las claves son PASSWORD y todos los PIN, PIN.
 */
export const PASSWORD = 'clave-de-pruebas';
export const PIN = '4321';

export type TestDatabase = ReturnType<typeof connectTestDatabase>['db'];

export function connectTestDatabase() {
  const client = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} });
  return { client, db: drizzle(client, { schema, casing: 'snake_case' }) };
}

export async function seedTenants(db: TestDatabase) {
  await db.execute(
    sql`truncate shift_corrections, shifts, employees, user_companies, users, companies, company_groups cascade`,
  );
  const [passwordHash, pinHash] = await Promise.all([
    hashSecret(PASSWORD),
    hashSecret(PIN),
  ]);

  const [groupA, groupB] = await db
    .insert(schema.companyGroups)
    .values([
      { name: 'Grupo A', slug: 'grupo-a' },
      { name: 'Grupo B', slug: 'grupo-b' },
    ])
    .returning();
  const [norte, sur, b] = await db
    .insert(schema.companies)
    .values([
      { groupId: groupA.id, name: 'A Norte', slug: 'a-norte' },
      { groupId: groupA.id, name: 'A Sur', slug: 'a-sur' },
      { groupId: groupB.id, name: 'B', slug: 'b' },
    ])
    .returning();
  const [superadmin, adminA, analystA, adminB] = await db
    .insert(schema.users)
    .values([
      {
        role: 'superadmin',
        name: 'Super',
        email: 'super@t.test',
        passwordHash,
      },
      {
        role: 'admin',
        groupId: groupA.id,
        name: 'Admin A',
        email: 'admin-a@t.test',
        passwordHash,
      },
      {
        role: 'analyst',
        groupId: groupA.id,
        name: 'Analista A',
        email: 'analista-a@t.test',
        passwordHash,
      },
      {
        role: 'admin',
        groupId: groupB.id,
        name: 'Admin B',
        email: 'admin-b@t.test',
        passwordHash,
      },
    ])
    .returning();
  await db.insert(schema.userCompanies).values([
    { userId: adminA.id, companyId: norte.id, groupId: groupA.id },
    { userId: adminA.id, companyId: sur.id, groupId: groupA.id },
    { userId: analystA.id, companyId: norte.id, groupId: groupA.id },
    { userId: adminB.id, companyId: b.id, groupId: groupB.id },
  ]);
  const [ana, anaSur, luis, bea] = await db
    .insert(schema.employees)
    .values([
      { companyId: norte.id, cedula: '12345678', name: 'Ana Pérez', pinHash },
      { companyId: sur.id, cedula: '12345678', name: 'Ana Pérez', pinHash },
      { companyId: norte.id, cedula: '87654321', name: 'Luis Gil', pinHash },
      { companyId: b.id, cedula: '11111111', name: 'Bea Ruiz', pinHash },
    ])
    .returning();

  return {
    groupA: groupA.id,
    groupB: groupB.id,
    norte: norte.id,
    sur: sur.id,
    b: b.id,
    superadmin: superadmin.id,
    adminA: adminA.id,
    analystA: analystA.id,
    adminB: adminB.id,
    ana: ana.id,
    anaSur: anaSur.id,
    luis: luis.id,
    bea: bea.id,
  };
}

export async function startApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app, app.get(ConfigService));
  await app.init();
  return app;
}

export async function loginStaff(
  app: NestExpressApplication,
  email: string,
  password = PASSWORD,
) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/staff/login')
    .send({ email, password })
    .expect(200);
  return agent;
}

export async function loginEmployee(
  app: NestExpressApplication,
  cedula: string,
  companyId?: string,
) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post('/api/auth/employee/login')
    .send({ cedula, pin: PIN, companyId })
    .expect(200);
  expect(res.body).toHaveProperty('user');
  return agent;
}
