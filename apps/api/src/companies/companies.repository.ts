import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database, DbExecutor } from '../database/database.module';
import { pgError, PG_UNIQUE_VIOLATION } from '../database/pg-error';
import { companies, companyGroups } from '../database/schema';

const companyColumns = {
  id: companies.id,
  name: companies.name,
  slug: companies.slug,
  rif: companies.rif,
  active: companies.active,
};

/**
 * Crea un grupo con su primera empresa (mismo nombre y código). Recibe la base o una
 * transacción para componerse con otras escrituras (el registro crea además al admin).
 */
export async function insertGroupWithCompany(
  db: DbExecutor,
  { name, slug }: { name: string; slug: string },
) {
  const [group] = await db
    .insert(companyGroups)
    .values({ name, slug })
    .returning({ id: companyGroups.id });
  const [company] = await db
    .insert(companies)
    .values({ groupId: group.id, name, slug })
    .returning({ id: companies.id });
  return { groupId: group.id, companyId: company.id };
}

/** Traduce un código de empresa o grupo repetido a 409. */
export function rethrowSlugConflict(error: unknown): never {
  const pg = pgError(error);
  if (
    pg?.code === PG_UNIQUE_VIOLATION &&
    (pg.constraint_name === 'companies_slug_unique' ||
      pg.constraint_name === 'company_groups_slug_unique')
  ) {
    throw new ConflictException(
      'Ya existe una empresa con ese código. Elige otro.',
    );
  }
  throw error;
}

@Injectable()
export class CompaniesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async exists(companyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId));
    return Boolean(row);
  }

  async groupExists(groupId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: companyGroups.id })
      .from(companyGroups)
      .where(eq(companyGroups.id, groupId));
    return Boolean(row);
  }

  /** Empresas con su grupo. `ids` undefined = todas (superadmin). */
  list(ids?: string[]) {
    const query = this.db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        active: companies.active,
        group: { id: companyGroups.id, name: companyGroups.name },
      })
      .from(companies)
      .innerJoin(companyGroups, eq(companyGroups.id, companies.groupId))
      .orderBy(asc(companyGroups.name), asc(companies.name));
    return ids ? query.where(inArray(companies.id, ids)) : query;
  }

  /** Todos los grupos con sus empresas (panel del superadmin). */
  async listGroups() {
    const [groups, rows] = await Promise.all([
      this.db
        .select({
          id: companyGroups.id,
          name: companyGroups.name,
          slug: companyGroups.slug,
        })
        .from(companyGroups)
        .orderBy(asc(companyGroups.name)),
      this.db
        .select({ ...companyColumns, groupId: companies.groupId })
        .from(companies)
        .orderBy(asc(companies.name)),
    ]);
    return groups.map((group) => ({
      ...group,
      companies: rows
        .filter((company) => company.groupId === group.id)
        .map(({ id, name, slug, rif, active }) => ({
          id,
          name,
          slug,
          rif,
          active,
        })),
    }));
  }

  createGroup(input: { name: string; slug: string }) {
    return this.db
      .transaction((tx) => insertGroupWithCompany(tx, input))
      .catch(rethrowSlugConflict);
  }

  async createCompany(
    groupId: string,
    input: { name: string; slug: string; rif?: string },
  ) {
    const [company] = await this.db
      .insert(companies)
      .values({ groupId, ...input })
      .returning(companyColumns)
      .catch(rethrowSlugConflict);
    return company;
  }

  async updateCompany(
    companyId: string,
    changes: { name?: string; rif?: string | null; active?: boolean },
  ) {
    const [company] = await this.db
      .update(companies)
      .set(changes)
      .where(eq(companies.id, companyId))
      .returning(companyColumns);
    return company;
  }
}
