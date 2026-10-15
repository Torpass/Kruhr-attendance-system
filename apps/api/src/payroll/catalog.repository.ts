import { Inject, Injectable } from '@nestjs/common';
import type { SalaryRule } from '@marcaje/core';
import { and, asc, count, desc, eq, lte } from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database, DbExecutor } from '../database/database.module';
import {
  companies,
  inputTypes,
  payrollParameters,
  payrollParameterValues,
  salaryRules,
  salaryStructures,
} from '../database/schema';

const ruleColumns = {
  code: salaryRules.code,
  name: salaryRules.name,
  sequence: salaryRules.sequence,
  appearsOnPayslip: salaryRules.appearsOnPayslip,
  condition: salaryRules.condition,
  quantitySource: salaryRules.quantitySource,
  quantityCode: salaryRules.quantityCode,
  amountType: salaryRules.amountType,
  amountFix: salaryRules.amountFix,
  baseCodes: salaryRules.baseCodes,
  amountCapParam: salaryRules.amountCapParam,
  rate: salaryRules.rate,
};

const structureColumns = {
  id: salaryStructures.id,
  code: salaryStructures.code,
  name: salaryStructures.name,
  schedulePay: salaryStructures.schedulePay,
  active: salaryStructures.active,
};

/** Catálogo de nómina de un grupo: estructuras con sus reglas, parámetros y tipos de entrada. */
@Injectable()
export class CatalogRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  listStructures(groupId: string) {
    return this.db
      .select({ ...structureColumns, rules: count(salaryRules.id) })
      .from(salaryStructures)
      .leftJoin(salaryRules, eq(salaryRules.structureId, salaryStructures.id))
      .where(eq(salaryStructures.groupId, groupId))
      .groupBy(salaryStructures.id)
      .orderBy(asc(salaryStructures.name));
  }

  async findStructure(groupId: string, id: string) {
    const [structure] = await this.db
      .select(structureColumns)
      .from(salaryStructures)
      .where(
        and(eq(salaryStructures.groupId, groupId), eq(salaryStructures.id, id)),
      );
    if (!structure) return undefined;
    return { ...structure, rules: await this.rules(id) };
  }

  /** Estructura del mismo grupo que la empresa (para lotes y contratos). */
  async findStructureForCompany(companyId: string, id: string) {
    const [row] = await this.db
      .select({ ...structureColumns, groupId: salaryStructures.groupId })
      .from(salaryStructures)
      .innerJoin(companies, eq(companies.groupId, salaryStructures.groupId))
      .where(and(eq(companies.id, companyId), eq(salaryStructures.id, id)));
    return row;
  }

  rules(structureId: string): Promise<SalaryRule[]> {
    return this.db
      .select(ruleColumns)
      .from(salaryRules)
      .where(eq(salaryRules.structureId, structureId))
      .orderBy(asc(salaryRules.sequence));
  }

  createStructure(
    groupId: string,
    values: {
      code: string;
      name: string;
      schedulePay: 'weekly' | 'semi_monthly' | 'monthly';
    },
    rules: SalaryRule[],
  ) {
    return this.db.transaction(async (tx) => {
      const [structure] = await tx
        .insert(salaryStructures)
        .values({ ...values, groupId })
        .returning({ id: salaryStructures.id });
      await insertRules(tx, structure.id, rules);
      return structure.id;
    });
  }

  updateStructure(
    groupId: string,
    id: string,
    changes: Partial<{
      name: string;
      schedulePay: 'weekly' | 'semi_monthly' | 'monthly';
      active: boolean;
    }>,
    rules?: SalaryRule[],
  ) {
    const fields = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const scope = and(
      eq(salaryStructures.groupId, groupId),
      eq(salaryStructures.id, id),
    );
    return this.db.transaction(async (tx) => {
      const [structure] =
        Object.keys(fields).length > 0
          ? await tx
              .update(salaryStructures)
              .set(fields)
              .where(scope)
              .returning({ id: salaryStructures.id })
          : await tx
              .select({ id: salaryStructures.id })
              .from(salaryStructures)
              .where(scope)
              .for('update');
      if (!structure) return false;
      if (rules) {
        // Se reemplaza el juego completo: así la estructura nunca queda a medio editar.
        await tx.delete(salaryRules).where(eq(salaryRules.structureId, id));
        await insertRules(tx, id, rules);
      }
      return true;
    });
  }

  async listParameters(groupId: string) {
    const [params, values] = await Promise.all([
      this.db
        .select({
          id: payrollParameters.id,
          code: payrollParameters.code,
          name: payrollParameters.name,
        })
        .from(payrollParameters)
        .where(eq(payrollParameters.groupId, groupId))
        .orderBy(asc(payrollParameters.code)),
      this.db
        .select({
          parameterId: payrollParameterValues.parameterId,
          dateFrom: payrollParameterValues.dateFrom,
          value: payrollParameterValues.value,
        })
        .from(payrollParameterValues)
        .innerJoin(
          payrollParameters,
          eq(payrollParameters.id, payrollParameterValues.parameterId),
        )
        .where(eq(payrollParameters.groupId, groupId))
        .orderBy(desc(payrollParameterValues.dateFrom)),
    ]);
    return params.map((param) => ({
      ...param,
      values: values
        .filter((v) => v.parameterId === param.id)
        .map(({ dateFrom, value }) => ({ dateFrom, value })),
    }));
  }

  createParameter(
    groupId: string,
    {
      code,
      name,
      dateFrom,
      value,
    }: { code: string; name: string; dateFrom: string; value: number },
  ) {
    return this.db.transaction(async (tx) => {
      const [param] = await tx
        .insert(payrollParameters)
        .values({ groupId, code, name })
        .returning({ id: payrollParameters.id });
      await tx
        .insert(payrollParameterValues)
        .values({ parameterId: param.id, dateFrom, value });
      return param.id;
    });
  }

  /** Agrega o reemplaza el valor que rige desde una fecha. */
  async setParameterValue(
    groupId: string,
    parameterId: string,
    dateFrom: string,
    value: number,
  ) {
    const [param] = await this.db
      .select({ id: payrollParameters.id })
      .from(payrollParameters)
      .where(
        and(
          eq(payrollParameters.groupId, groupId),
          eq(payrollParameters.id, parameterId),
        ),
      );
    if (!param) return false;
    await this.db
      .insert(payrollParameterValues)
      .values({ parameterId, dateFrom, value })
      .onConflictDoUpdate({
        target: [
          payrollParameterValues.parameterId,
          payrollParameterValues.dateFrom,
        ],
        set: { value },
      });
    return true;
  }

  /** Valor vigente de cada parámetro en una fecha (el de `date_from` más reciente hasta esa fecha). */
  async parameterValuesAt(
    groupId: string,
    date: string,
  ): Promise<Record<string, number>> {
    const rows = await this.db
      .selectDistinctOn([payrollParameters.id], {
        code: payrollParameters.code,
        value: payrollParameterValues.value,
      })
      .from(payrollParameterValues)
      .innerJoin(
        payrollParameters,
        eq(payrollParameters.id, payrollParameterValues.parameterId),
      )
      .where(
        and(
          eq(payrollParameters.groupId, groupId),
          lte(payrollParameterValues.dateFrom, date),
        ),
      )
      .orderBy(payrollParameters.id, desc(payrollParameterValues.dateFrom));
    return Object.fromEntries(rows.map((row) => [row.code, row.value]));
  }

  listInputTypes(groupId: string) {
    return this.db
      .select({
        id: inputTypes.id,
        code: inputTypes.code,
        name: inputTypes.name,
      })
      .from(inputTypes)
      .where(eq(inputTypes.groupId, groupId))
      .orderBy(asc(inputTypes.code));
  }

  async createInputType(
    groupId: string,
    values: { code: string; name: string },
  ) {
    const [row] = await this.db
      .insert(inputTypes)
      .values({ ...values, groupId })
      .returning({
        id: inputTypes.id,
        code: inputTypes.code,
        name: inputTypes.name,
      });
    return row;
  }
}

async function insertRules(
  db: DbExecutor,
  structureId: string,
  rules: SalaryRule[],
) {
  if (rules.length === 0) return;
  await db.insert(salaryRules).values(
    rules.map((rule) => ({
      ...rule,
      structureId,
      baseCodes: rule.baseCodes ?? null,
    })),
  );
}
