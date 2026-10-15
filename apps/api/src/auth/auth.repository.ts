import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { SessionUser } from '../common/auth/session';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import {
  companies,
  companyGroups,
  employees,
  userCompanies,
  users,
} from '../database/schema';

export interface EmployeeCredentials {
  id: string;
  pinHash: string;
  company: { id: string; name: string };
}

/** Consultas de credenciales y de sesión. Solo devuelve personas y empresas activas. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findStaffCredentials(
    email: string,
  ): Promise<{ id: string; passwordHash: string } | undefined> {
    const [row] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.email, email), eq(users.active, true)));
    return row;
  }

  /** Registros activos de una cédula, uno por empresa activa donde trabaja. */
  findEmployeeCredentials(cedula: string): Promise<EmployeeCredentials[]> {
    return this.db
      .select({
        id: employees.id,
        pinHash: employees.pinHash,
        company: { id: companies.id, name: companies.name },
      })
      .from(employees)
      .innerJoin(companies, eq(companies.id, employees.companyId))
      .where(
        and(
          eq(employees.cedula, cedula),
          eq(employees.active, true),
          eq(companies.active, true),
        ),
      )
      .orderBy(asc(companies.name));
  }

  /** Grupo + primera empresa + admin, todo o nada. Devuelve el id del admin. */
  registerCompany(input: {
    companyName: string;
    slug: string;
    adminName: string;
    email: string;
    passwordHash: string;
  }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .insert(companyGroups)
        .values({ name: input.companyName, slug: input.slug })
        .returning({ id: companyGroups.id });
      const [company] = await tx
        .insert(companies)
        .values({
          groupId: group.id,
          name: input.companyName,
          slug: input.slug,
        })
        .returning({ id: companies.id });
      const [admin] = await tx
        .insert(users)
        .values({
          role: 'admin',
          groupId: group.id,
          name: input.adminName,
          email: input.email,
          passwordHash: input.passwordHash,
        })
        .returning({ id: users.id });
      await tx
        .insert(userCompanies)
        .values({ userId: admin.id, companyId: company.id, groupId: group.id });
      return admin.id;
    });
  }

  async findStaffSession(id: string): Promise<SessionUser | undefined> {
    const [row] = await this.db
      .select({
        id: users.id,
        role: users.role,
        name: users.name,
        email: users.email,
        groupId: users.groupId,
        companyIds: sql<string[]>`coalesce(
          array_agg(${companies.id}) filter (where ${companies.id} is not null),
          '{}'
        )`,
      })
      .from(users)
      .leftJoin(userCompanies, eq(userCompanies.userId, users.id))
      .leftJoin(
        companies,
        and(
          eq(companies.id, userCompanies.companyId),
          eq(companies.active, true),
        ),
      )
      .where(and(eq(users.id, id), eq(users.active, true)))
      .groupBy(users.id);
    return row && { kind: 'staff', ...row };
  }

  async findEmployeeSession(id: string): Promise<SessionUser | undefined> {
    const [row] = await this.db
      .select({
        id: employees.id,
        name: employees.name,
        cedula: employees.cedula,
        companyId: employees.companyId,
        companyName: companies.name,
        groupId: companies.groupId,
      })
      .from(employees)
      .innerJoin(companies, eq(companies.id, employees.companyId))
      .where(
        and(
          eq(employees.id, id),
          eq(employees.active, true),
          eq(companies.active, true),
        ),
      );
    if (!row) return undefined;
    const { companyId, ...employee } = row;
    return {
      kind: 'employee',
      role: 'employee',
      ...employee,
      companyIds: [companyId],
    };
  }
}
