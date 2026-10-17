import { Inject, Injectable } from '@nestjs/common';
import { addDays, type Period } from '@marcaje/core';
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database, DbExecutor } from '../database/database.module';
import {
  contracts,
  employees,
  payrollRuns,
  salaryStructures,
  workSchedules,
} from '../database/schema';

/** Sin fin: para comparar rangos abiertos. */
const OPEN_END = '9999-12-31';

/**
 * ¿Algún lote validado o pagado de la empresa y la estructura toca [from, to]? Cambiar la
 * vigencia de un contrato en esos días cambiaría quién entra en una nómina ya cerrada.
 */
async function touchesClosedPayroll(
  db: DbExecutor,
  companyId: string,
  structureId: string,
  from: string,
  to: string,
) {
  const [run] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.structureId, structureId),
        inArray(payrollRuns.state, ['validated', 'paid']),
        lte(payrollRuns.dateFrom, to),
        gte(payrollRuns.dateTo, from),
      ),
    )
    .limit(1);
  return Boolean(run);
}

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

  /**
   * Cambia el inicio y/o el fin de un contrato. `'closed_payroll'` si los días que entran o salen
   * de la vigencia tocan una nómina validada o pagada. Los solapes y las fechas invertidas los
   * rechaza la base (EXCLUDE y CHECK).
   */
  update(
    companyId: string,
    employeeId: string,
    id: string,
    changes: { dateStart?: string; dateEnd?: string | null },
  ) {
    return this.db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.companyId, companyId),
            eq(contracts.employeeId, employeeId),
            eq(contracts.id, id),
          ),
        )
        .for('update');
      if (!contract) return undefined;

      const dateStart = changes.dateStart ?? contract.dateStart;
      const dateEnd =
        changes.dateEnd === undefined ? contract.dateEnd : changes.dateEnd;
      // Días que entran o salen de la vigencia: entre el inicio viejo y el nuevo, y entre el fin
      // viejo y el nuevo (sin fin = OPEN_END).
      const ranges: { from: string; to: string }[] = [];
      if (dateStart !== contract.dateStart) {
        const [a, b] = [contract.dateStart, dateStart].sort();
        ranges.push({ from: a, to: addDays(b, -1) });
      }
      const [oldEnd, newEnd] = [
        contract.dateEnd ?? OPEN_END,
        dateEnd ?? OPEN_END,
      ];
      if (oldEnd !== newEnd) {
        const [a, b] = [oldEnd, newEnd].sort();
        ranges.push({ from: addDays(a, 1), to: b });
      }
      for (const { from, to } of ranges) {
        if (
          await touchesClosedPayroll(
            tx,
            companyId,
            contract.structureId,
            from,
            to,
          )
        ) {
          return 'closed_payroll' as const;
        }
      }

      await tx
        .update(contracts)
        .set({ dateStart, dateEnd })
        .where(eq(contracts.id, id));
      return 'updated' as const;
    });
  }

  /** Borra un contrato. Falla con violación de FK si ya tiene recibos de nómina. */
  async remove(companyId: string, employeeId: string, id: string) {
    const [row] = await this.db
      .delete(contracts)
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.employeeId, employeeId),
          eq(contracts.id, id),
        ),
      )
      .returning({ id: contracts.id });
    return Boolean(row);
  }

  /**
   * Otro horario desde `dateFrom`, en una transacción:
   * - si `dateFrom` es el inicio del contrato, cambia el horario de ese mismo contrato;
   * - si cae después, lo cierra el día anterior y abre uno igual (estructura, salario y fin).
   * `undefined` si no existe; `'out_of_range'` si la fecha no está dentro de su vigencia.
   */
  changeSchedule(
    companyId: string,
    employeeId: string,
    id: string,
    scheduleId: string | null,
    dateFrom: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.companyId, companyId),
            eq(contracts.employeeId, employeeId),
            eq(contracts.id, id),
          ),
        )
        .for('update');
      if (!contract) return undefined;
      if (
        dateFrom < contract.dateStart ||
        (contract.dateEnd !== null && dateFrom > contract.dateEnd)
      ) {
        return 'out_of_range' as const;
      }
      if (dateFrom === contract.dateStart) {
        await tx
          .update(contracts)
          .set({ scheduleId })
          .where(eq(contracts.id, id));
        return 'changed' as const;
      }
      await tx
        .update(contracts)
        .set({ dateEnd: addDays(dateFrom, -1) })
        .where(eq(contracts.id, id));
      await tx.insert(contracts).values({
        companyId,
        employeeId,
        structureId: contract.structureId,
        scheduleId,
        wage: contract.wage,
        dateStart: dateFrom,
        dateEnd: contract.dateEnd,
      });
      return 'changed' as const;
    });
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
