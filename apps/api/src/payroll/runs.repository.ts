import { Inject, Injectable } from '@nestjs/common';
import type { PayslipResult, WorkedHourCode } from '@marcaje/core';
import { and, asc, count, desc, eq, inArray, sum } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database, DbExecutor } from '../database/database.module';
import {
  companies,
  employees,
  payrollRuns,
  payslipInputs,
  payslipLines,
  payslips,
  payslipWorkedHours,
  salaryStructures,
} from '../database/schema';

export type RunState = 'computed' | 'validated' | 'paid' | 'cancelled';

/** Lo que se guarda de un recibo calculado. */
export interface PayslipCalculation {
  employeeId: string;
  contractId: string;
  wage: number;
  workedMinutes: Record<WorkedHourCode, number>;
  inputs: Record<string, number>;
  result: PayslipResult;
}

const runColumns = {
  id: payrollRuns.id,
  companyId: payrollRuns.companyId,
  name: payrollRuns.name,
  dateFrom: payrollRuns.dateFrom,
  dateTo: payrollRuns.dateTo,
  state: payrollRuns.state,
  computedAt: payrollRuns.computedAt,
  createdAt: payrollRuns.createdAt,
  structure: {
    id: salaryStructures.id,
    name: salaryStructures.name,
    groupId: salaryStructures.groupId,
  },
};

async function writeCalculation(
  db: DbExecutor,
  payslipId: string,
  calc: PayslipCalculation,
) {
  await db.insert(payslipWorkedHours).values(
    Object.entries(calc.workedMinutes).map(([code, minutes]) => ({
      payslipId,
      code,
      minutes,
    })),
  );
  const inputs = Object.entries(calc.inputs);
  if (inputs.length > 0) {
    await db
      .insert(payslipInputs)
      .values(inputs.map(([code, amount]) => ({ payslipId, code, amount })));
  }
  if (calc.result.lines.length > 0) {
    await db
      .insert(payslipLines)
      .values(calc.result.lines.map((line) => ({ ...line, payslipId })));
  }
}

@Injectable()
export class RunsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(companyId: string) {
    return this.db
      .select({
        ...runColumns,
        payslips: count(payslips.id),
        net: sum(payslips.net).mapWith(Number),
      })
      .from(payrollRuns)
      .innerJoin(
        salaryStructures,
        eq(salaryStructures.id, payrollRuns.structureId),
      )
      .leftJoin(payslips, eq(payslips.runId, payrollRuns.id))
      .where(eq(payrollRuns.companyId, companyId))
      .groupBy(payrollRuns.id, salaryStructures.id)
      .orderBy(desc(payrollRuns.dateFrom), desc(payrollRuns.createdAt));
  }

  async find(companyId: string, runId: string) {
    const [run] = await this.db
      .select(runColumns)
      .from(payrollRuns)
      .innerJoin(
        salaryStructures,
        eq(salaryStructures.id, payrollRuns.structureId),
      )
      .where(
        and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.id, runId)),
      );
    return run;
  }

  payslips(runId: string) {
    return this.db
      .select({
        id: payslips.id,
        contractId: payslips.contractId,
        wage: payslips.wage,
        earnings: payslips.earnings,
        deductions: payslips.deductions,
        net: payslips.net,
        employee: {
          id: employees.id,
          name: employees.name,
          cedula: employees.cedula,
        },
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(eq(payslips.runId, runId))
      .orderBy(asc(employees.name));
  }

  /** Nombre y RIF de la empresa, para el encabezado del recibo. */
  async company(companyId: string) {
    const [row] = await this.db
      .select({ name: companies.name, rif: companies.rif })
      .from(companies)
      .where(eq(companies.id, companyId));
    return row;
  }

  /** Recibo con sus líneas, horas y entradas. `employeeId` limita a los del colaborador. */
  async findPayslip(
    scope: { companyId?: string; employeeId?: string; states?: RunState[] },
    payslipId: string,
  ) {
    const [slip] = await this.db
      .select({
        id: payslips.id,
        runId: payslips.runId,
        companyId: payslips.companyId,
        contractId: payslips.contractId,
        wage: payslips.wage,
        earnings: payslips.earnings,
        deductions: payslips.deductions,
        net: payslips.net,
        employee: {
          id: employees.id,
          name: employees.name,
          cedula: employees.cedula,
        },
        run: {
          name: payrollRuns.name,
          dateFrom: payrollRuns.dateFrom,
          dateTo: payrollRuns.dateTo,
          state: payrollRuns.state,
          structureId: payrollRuns.structureId,
        },
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(
        and(
          eq(payslips.id, payslipId),
          scope.companyId ? eq(payslips.companyId, scope.companyId) : undefined,
          scope.employeeId
            ? eq(payslips.employeeId, scope.employeeId)
            : undefined,
          scope.states ? inArray(payrollRuns.state, scope.states) : undefined,
        ),
      );
    if (!slip) return undefined;
    const [lines, hours, inputs] = await Promise.all([
      this.db
        .select({
          code: payslipLines.code,
          name: payslipLines.name,
          sequence: payslipLines.sequence,
          quantity: payslipLines.quantity,
          amount: payslipLines.amount,
          rate: payslipLines.rate,
          total: payslipLines.total,
          appearsOnPayslip: payslipLines.appearsOnPayslip,
        })
        .from(payslipLines)
        .where(eq(payslipLines.payslipId, payslipId))
        .orderBy(asc(payslipLines.sequence)),
      this.db
        .select({
          code: payslipWorkedHours.code,
          minutes: payslipWorkedHours.minutes,
        })
        .from(payslipWorkedHours)
        .where(eq(payslipWorkedHours.payslipId, payslipId)),
      this.db
        .select({ code: payslipInputs.code, amount: payslipInputs.amount })
        .from(payslipInputs)
        .where(eq(payslipInputs.payslipId, payslipId)),
    ]);
    return {
      ...slip,
      lines,
      workedMinutes: Object.fromEntries(hours.map((h) => [h.code, h.minutes])),
      inputs: Object.fromEntries(inputs.map((i) => [i.code, i.amount])),
    };
  }

  /**
   * Recibos de un colaborador, del más reciente al más viejo. Por defecto solo validados o pagados
   * (vista "mis recibos"); RRHH pide también los calculados. `companyId` limita a su empresa.
   */
  listForEmployee(
    employeeId: string,
    {
      companyId,
      states = ['validated', 'paid'],
    }: { companyId?: string; states?: RunState[] } = {},
  ) {
    return this.db
      .select({
        id: payslips.id,
        net: payslips.net,
        run: {
          id: payrollRuns.id,
          name: payrollRuns.name,
          dateFrom: payrollRuns.dateFrom,
          dateTo: payrollRuns.dateTo,
          state: payrollRuns.state,
        },
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(
        and(
          eq(payslips.employeeId, employeeId),
          companyId ? eq(payslips.companyId, companyId) : undefined,
          inArray(payrollRuns.state, states),
        ),
      )
      .orderBy(desc(payrollRuns.dateTo));
  }

  /** Crea el lote con todos sus recibos en una transacción. */
  createRun(
    values: {
      companyId: string;
      structureId: string;
      name: string;
      dateFrom: string;
      dateTo: string;
      createdBy: string;
    },
    calculations: PayslipCalculation[],
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(payrollRuns)
        .values(values)
        .returning({ id: payrollRuns.id });
      for (const calc of calculations) {
        const [slip] = await tx
          .insert(payslips)
          .values({
            runId: run.id,
            companyId: values.companyId,
            employeeId: calc.employeeId,
            contractId: calc.contractId,
            wage: calc.wage,
            earnings: calc.result.earnings,
            deductions: calc.result.deductions,
            net: calc.result.net,
          })
          .returning({ id: payslips.id });
        await writeCalculation(tx, slip.id, calc);
      }
      return run.id;
    });
  }

  /** Reemplaza el cálculo de recibos existentes (recalcular o cambiar entradas). */
  replaceCalculations(
    runId: string,
    updates: { payslipId: string; calc: PayslipCalculation }[],
  ) {
    return this.db.transaction(async (tx) => {
      for (const { payslipId, calc } of updates) {
        await tx
          .delete(payslipLines)
          .where(eq(payslipLines.payslipId, payslipId));
        await tx
          .delete(payslipWorkedHours)
          .where(eq(payslipWorkedHours.payslipId, payslipId));
        await tx
          .delete(payslipInputs)
          .where(eq(payslipInputs.payslipId, payslipId));
        await tx
          .update(payslips)
          .set({
            wage: calc.wage,
            earnings: calc.result.earnings,
            deductions: calc.result.deductions,
            net: calc.result.net,
          })
          .where(eq(payslips.id, payslipId));
        await writeCalculation(tx, payslipId, calc);
      }
      await tx
        .update(payrollRuns)
        .set({ computedAt: new Date(), updatedAt: new Date() })
        .where(eq(payrollRuns.id, runId));
    });
  }

  /** Cambia el estado si el lote está en uno de los estados de origen. */
  async transition(
    companyId: string,
    runId: string,
    from: RunState[],
    to: RunState,
  ) {
    const [row] = await this.db
      .update(payrollRuns)
      .set({ state: to, updatedAt: new Date() })
      .where(
        and(
          eq(payrollRuns.companyId, companyId),
          eq(payrollRuns.id, runId),
          inArray(payrollRuns.state, from),
        ),
      )
      .returning({ id: payrollRuns.id });
    return Boolean(row);
  }
}
