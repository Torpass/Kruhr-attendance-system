import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { companies, companyGroups } from '../database/schema';

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
}
