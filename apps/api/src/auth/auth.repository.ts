import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { SessionUser } from '../common/auth/session';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { companies, employees, userCompanies, users } from '../database/schema';

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

  async findEmployeeCredentials(
    companySlug: string,
    cedula: string,
  ): Promise<{ id: string; pinHash: string } | undefined> {
    const [row] = await this.db
      .select({ id: employees.id, pinHash: employees.pinHash })
      .from(employees)
      .innerJoin(companies, eq(companies.id, employees.companyId))
      .where(
        and(
          eq(companies.slug, companySlug),
          eq(companies.active, true),
          eq(employees.cedula, cedula),
          eq(employees.active, true),
        ),
      );
    return row;
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
