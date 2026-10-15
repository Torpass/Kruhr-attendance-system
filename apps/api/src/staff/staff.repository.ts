import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { userCompanies, users } from '../database/schema';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'analyst';
  active: boolean;
  companyIds: string[];
}

const staffColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  active: users.active,
  companyIds: sql<string[]>`coalesce(
    array_agg(${userCompanies.companyId}) filter (where ${userCompanies.companyId} is not null),
    '{}'
  )`,
};

/** Usuarios de gestión (admins y analistas) de un grupo, con sus empresas asignadas. */
@Injectable()
export class StaffRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(groupId: string): Promise<StaffMember[]> {
    return this.db
      .select(staffColumns)
      .from(users)
      .leftJoin(userCompanies, eq(userCompanies.userId, users.id))
      .where(eq(users.groupId, groupId))
      .groupBy(users.id)
      .orderBy(asc(users.name));
  }

  async find(groupId: string, id: string): Promise<StaffMember | undefined> {
    const [row] = await this.db
      .select(staffColumns)
      .from(users)
      .leftJoin(userCompanies, eq(userCompanies.userId, users.id))
      .where(and(eq(users.groupId, groupId), eq(users.id, id)))
      .groupBy(users.id);
    return row;
  }

  /** Usuario y sus empresas en una transacción. Las FKs compuestas rechazan empresas de otro grupo. */
  async create(
    groupId: string,
    values: Omit<typeof users.$inferInsert, 'groupId'>,
    companyIds: string[],
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ ...values, groupId })
        .returning({ id: users.id });
      await tx.insert(userCompanies).values(
        companyIds.map((companyId) => ({
          userId: user.id,
          companyId,
          groupId,
        })),
      );
      return user.id;
    });
  }

  async update(
    groupId: string,
    id: string,
    changes: Partial<
      Pick<
        typeof users.$inferInsert,
        'name' | 'role' | 'active' | 'passwordHash'
      >
    >,
    companyIds?: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Las claves con undefined no se actualizan (Drizzle falla si no queda ninguna).
      if (Object.values(changes).some((value) => value !== undefined)) {
        await tx
          .update(users)
          .set(changes)
          .where(and(eq(users.groupId, groupId), eq(users.id, id)));
      }
      if (companyIds) {
        await tx
          .delete(userCompanies)
          .where(
            and(
              eq(userCompanies.userId, id),
              companyIds.length > 0
                ? notInArray(userCompanies.companyId, companyIds)
                : undefined,
            ),
          );
        if (companyIds.length > 0) {
          await tx
            .insert(userCompanies)
            .values(
              companyIds.map((companyId) => ({
                userId: id,
                companyId,
                groupId,
              })),
            )
            .onConflictDoNothing();
        }
      }
    });
  }
}
