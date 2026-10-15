import {
  SAMPLE_BIWEEKLY_RULES,
  SAMPLE_INPUT_TYPES,
  SAMPLE_PARAMETERS,
} from '@marcaje/core';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashSecret } from '../auth/password';
import type { Transaction as Tx } from './database.module';
import {
  companies,
  companyGroups,
  contracts,
  employees,
  inputTypes,
  payrollParameters,
  payrollParameterValues,
  salaryRules,
  salaryStructures,
  userCompanies,
  users,
} from './schema';
import { connectForScript } from './script-client';

/**
 * Datos de demo: superadmin, Empresa A (dos sub-empresas: admin, analista y una colaboradora en ambas)
 * y Empresa B (admin), con un catálogo de nómina de referencia y contratos para Ana.
 * Es idempotente: se puede correr de nuevo para rotar las claves.
 * Las claves vienen de variables SEED_*; nunca se escriben en el código.
 */
const seedEnv = z.object({
  SEED_SUPERADMIN_EMAIL: z.email().trim().toLowerCase(),
  SEED_SUPERADMIN_PASSWORD: z.string().min(12),
  SEED_DEMO_PASSWORD: z.string().min(8),
  SEED_DEMO_PIN: z.string().regex(/^\d{4,6}$/),
});

async function upsertGroup(tx: Tx, name: string, slug: string) {
  const [group] = await tx
    .insert(companyGroups)
    .values({ name, slug })
    .onConflictDoUpdate({ target: companyGroups.slug, set: { name } })
    .returning({ id: companyGroups.id });
  return group.id;
}

async function upsertCompany(
  tx: Tx,
  groupId: string,
  name: string,
  slug: string,
) {
  const [company] = await tx
    .insert(companies)
    .values({ groupId, name, slug })
    .onConflictDoUpdate({ target: companies.slug, set: { name } })
    .returning({ id: companies.id, groupId: companies.groupId });
  if (company.groupId !== groupId) {
    throw new Error(`La empresa ${slug} ya existe en otro grupo`);
  }
  return company.id;
}

async function upsertStaff(
  tx: Tx,
  user: Omit<typeof users.$inferInsert, 'passwordHash'> & { password: string },
  companyIds: string[] = [],
) {
  const { password, ...values } = user;
  const passwordHash = await hashSecret(password);
  const [row] = await tx
    .insert(users)
    .values({ ...values, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: values.name, passwordHash, active: true },
    })
    .returning({ id: users.id, role: users.role, groupId: users.groupId });
  if (row.role !== values.role || row.groupId !== (values.groupId ?? null)) {
    throw new Error(
      `El usuario ${values.email} ya existe con otro rol o grupo`,
    );
  }
  if (companyIds.length > 0) {
    await tx
      .insert(userCompanies)
      .values(
        companyIds.map((companyId) => ({
          userId: row.id,
          companyId,
          groupId: row.groupId!,
        })),
      )
      .onConflictDoNothing();
  }
}

/** Catálogo de nómina de referencia (estructura quincenal, parámetros y entradas). */
async function upsertPayrollCatalog(tx: Tx, groupId: string) {
  for (const { code, name, value } of SAMPLE_PARAMETERS) {
    const [param] = await tx
      .insert(payrollParameters)
      .values({ groupId, code, name })
      .onConflictDoUpdate({
        target: [payrollParameters.groupId, payrollParameters.code],
        set: { name },
      })
      .returning({ id: payrollParameters.id });
    await tx
      .insert(payrollParameterValues)
      .values({ parameterId: param.id, dateFrom: '2026-01-01', value })
      .onConflictDoUpdate({
        target: [
          payrollParameterValues.parameterId,
          payrollParameterValues.dateFrom,
        ],
        set: { value },
      });
  }
  for (const type of SAMPLE_INPUT_TYPES) {
    await tx
      .insert(inputTypes)
      .values({ groupId, ...type })
      .onConflictDoUpdate({
        target: [inputTypes.groupId, inputTypes.code],
        set: { name: type.name },
      });
  }
  const [structure] = await tx
    .insert(salaryStructures)
    .values({
      groupId,
      code: 'QUINCENAL_VE',
      name: 'Quincenal VE',
      schedulePay: 'semi_monthly',
    })
    .onConflictDoUpdate({
      target: [salaryStructures.groupId, salaryStructures.code],
      set: { name: 'Quincenal VE' },
    })
    .returning({ id: salaryStructures.id });
  await tx.delete(salaryRules).where(eq(salaryRules.structureId, structure.id));
  await tx.insert(salaryRules).values(
    SAMPLE_BIWEEKLY_RULES.map((rule) => ({
      ...rule,
      structureId: structure.id,
    })),
  );
  return structure.id;
}

/** Contrato vigente desde el inicio del año, si el colaborador aún no tiene uno. */
async function ensureContract(
  tx: Tx,
  employeeId: string,
  companyId: string,
  structureId: string,
) {
  const [existing] = await tx
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.employeeId, employeeId),
        eq(contracts.structureId, structureId),
      ),
    );
  if (existing) return;
  await tx.insert(contracts).values({
    employeeId,
    companyId,
    structureId,
    wage: 3600,
    dateStart: '2026-01-01',
  });
}

async function main() {
  const { client, db } = connectForScript();

  try {
    const env = seedEnv.parse(process.env);
    await db.transaction(async (tx) => {
      await upsertStaff(tx, {
        role: 'superadmin',
        name: 'Superusuario',
        email: env.SEED_SUPERADMIN_EMAIL,
        password: env.SEED_SUPERADMIN_PASSWORD,
      });

      const groupA = await upsertGroup(tx, 'Empresa A', 'empresa-a');
      const aNorte = await upsertCompany(
        tx,
        groupA,
        'Empresa A · Norte',
        'empresa-a-norte',
      );
      const aSur = await upsertCompany(
        tx,
        groupA,
        'Empresa A · Sur',
        'empresa-a-sur',
      );
      await upsertStaff(
        tx,
        {
          role: 'admin',
          groupId: groupA,
          name: 'Admin Empresa A',
          email: 'admin@empresa-a.test',
          password: env.SEED_DEMO_PASSWORD,
        },
        [aNorte, aSur],
      );
      await upsertStaff(
        tx,
        {
          role: 'analyst',
          groupId: groupA,
          name: 'Analista Empresa A',
          email: 'analista@empresa-a.test',
          password: env.SEED_DEMO_PASSWORD,
        },
        [aNorte],
      );
      // Ana trabaja en las dos empresas del grupo A: al entrar elige en cuál marca.
      const pinHash = await hashSecret(env.SEED_DEMO_PIN);
      const ana = await tx
        .insert(employees)
        .values(
          [aNorte, aSur].map((companyId) => ({
            companyId,
            cedula: '12345678',
            name: 'Ana Pérez',
            pinHash,
          })),
        )
        .onConflictDoUpdate({
          target: [employees.companyId, employees.cedula],
          set: { pinHash, active: true },
        })
        .returning({ id: employees.id, companyId: employees.companyId });
      const structureA = await upsertPayrollCatalog(tx, groupA);
      for (const record of ana) {
        await ensureContract(tx, record.id, record.companyId, structureA);
      }

      const groupB = await upsertGroup(tx, 'Empresa B', 'empresa-b');
      const b = await upsertCompany(tx, groupB, 'Empresa B', 'empresa-b');
      await upsertPayrollCatalog(tx, groupB);
      await upsertStaff(
        tx,
        {
          role: 'admin',
          groupId: groupB,
          name: 'Admin Empresa B',
          email: 'admin@empresa-b.test',
          password: env.SEED_DEMO_PASSWORD,
        },
        [b],
      );
    });

    const [counts] = await db.execute<{ users: number; employees: number }>(
      sql`select (select count(*) from users)::int as users,
                 (select count(*) from employees)::int as employees`,
    );
    console.log('Seed listo:', counts);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
