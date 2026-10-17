import { Inject, Injectable } from '@nestjs/common';
import type { Period } from '@marcaje/core';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { companies, contracts, workSchedules } from '../database/schema';

export const scheduleColumns = {
  id: workSchedules.id,
  code: workSchedules.code,
  name: workSchedules.name,
  active: workSchedules.active,
  overtimeMode: workSchedules.overtimeMode,
  ordinaryMinutes: workSchedules.ordinaryMinutes,
  days: workSchedules.days,
  breakMinutes: workSchedules.breakMinutes,
  breakAfterMinutes: workSchedules.breakAfterMinutes,
  nightStart: workSchedules.nightStart,
  nightEnd: workSchedules.nightEnd,
  weeklyOvertimeAlertMinutes: workSchedules.weeklyOvertimeAlertMinutes,
};

export type ScheduleRow = Awaited<
  ReturnType<SchedulesRepository['list']>
>[number];
type ScheduleValues = Omit<typeof workSchedules.$inferInsert, 'id' | 'groupId'>;

@Injectable()
export class SchedulesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(groupId: string) {
    return this.db
      .select(scheduleColumns)
      .from(workSchedules)
      .where(eq(workSchedules.groupId, groupId))
      .orderBy(asc(workSchedules.name));
  }

  async find(groupId: string, id: string) {
    const [row] = await this.db
      .select(scheduleColumns)
      .from(workSchedules)
      .where(and(eq(workSchedules.groupId, groupId), eq(workSchedules.id, id)));
    return row;
  }

  /** Horario del grupo de la empresa (para asignarlo en un contrato). */
  async findForCompany(companyId: string, id: string) {
    const [row] = await this.db
      .select(scheduleColumns)
      .from(workSchedules)
      .innerJoin(companies, eq(companies.groupId, workSchedules.groupId))
      .where(and(eq(companies.id, companyId), eq(workSchedules.id, id)));
    return row;
  }

  async create(groupId: string, values: ScheduleValues) {
    const [row] = await this.db
      .insert(workSchedules)
      .values({ ...values, groupId })
      .returning({ id: workSchedules.id });
    return row.id;
  }

  async update(groupId: string, id: string, changes: Partial<ScheduleValues>) {
    const [row] = await this.db
      .update(workSchedules)
      .set(changes)
      .where(and(eq(workSchedules.groupId, groupId), eq(workSchedules.id, id)))
      .returning({ id: workSchedules.id });
    return Boolean(row);
  }

  /** Contratos de la empresa que tocan el período, con el horario de cada uno (o null). */
  contractSchedules(companyId: string, { from, to }: Period) {
    return this.db
      .select({
        employeeId: contracts.employeeId,
        dateStart: contracts.dateStart,
        dateEnd: contracts.dateEnd,
        schedule: scheduleColumns,
      })
      .from(contracts)
      .leftJoin(workSchedules, eq(workSchedules.id, contracts.scheduleId))
      .where(
        and(
          eq(contracts.companyId, companyId),
          lte(contracts.dateStart, to),
          or(isNull(contracts.dateEnd), gte(contracts.dateEnd, from)),
        ),
      );
  }
}
