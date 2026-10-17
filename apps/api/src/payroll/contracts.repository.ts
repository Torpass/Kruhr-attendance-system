import { Inject, Injectable } from '@nestjs/common';
import type { Period } from '@marcaje/core';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database } from '../database/database.module';
import {
  contracts,
  employees,
  salaryStructures,
  workSchedules,
} from '../database/schema';

const contractColumns = {
  id: contracts.id,
  employeeId: contracts.employeeId,
  wage: contracts.wage,
  dateStart: contracts.dateStart,
  dateEnd: contracts.dateEnd,
  structure: { id: salaryStructures.id, name: salaryStructures.name },
  schedule: { id: workSchedules.id, name: workSchedules.name },
};

@Injectable()
export class ContractsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(companyId: string, employeeId: string) {
    return this.db
      .select(contractColumns)
      .from(contracts)
      .innerJoin(
        salaryStructures,
        eq(salaryStructures.id, contracts.structureId),
      )
      .leftJoin(workSchedules, eq(workSchedules.id, contracts.scheduleId))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.employeeId, employeeId),
        ),
      )
      .orderBy(desc(contracts.dateStart));
  }

  async create(values: typeof contracts.$inferInsert) {
    const [row] = await this.db
      .insert(contracts)
      .values(values)
      .returning({ id: contracts.id });
    return row.id;
  }

  async end(companyId: string, id: string, dateEnd: string) {
    const [row] = await this.db
      .update(contracts)
      .set({ dateEnd })
      .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
      .returning({ id: contracts.id });
    return Boolean(row);
  }

  /**
   * Contratos de la estructura que tocan el período, uno por colaborador:
   * si cambió de contrato a mitad de período, rige el último.
   */
  forRun(companyId: string, structureId: string, { from, to }: Period) {
    return this.db
      .selectDistinctOn([contracts.employeeId], {
        id: contracts.id,
        employeeId: contracts.employeeId,
        wage: contracts.wage,
        employee: { name: employees.name, cedula: employees.cedula },
      })
      .from(contracts)
      .innerJoin(employees, eq(employees.id, contracts.employeeId))
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.structureId, structureId),
          lte(contracts.dateStart, to),
          or(isNull(contracts.dateEnd), gte(contracts.dateEnd, from)),
        ),
      )
      .orderBy(contracts.employeeId, desc(contracts.dateStart));
  }
}
