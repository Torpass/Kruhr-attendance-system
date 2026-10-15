import {
  SAMPLE_BIWEEKLY_RULES,
  SAMPLE_INPUT_TYPES,
  SAMPLE_PARAMETERS,
} from '@marcaje/core';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database.module';
import {
  inputTypes,
  payrollParameters,
  payrollParameterValues,
  salaryRules,
  salaryStructures,
} from '../database/schema';

const SAMPLE_CODE = 'QUINCENAL_VE';
const SAMPLE_VALUES_FROM = '2026-01-01';

/**
 * Catálogo de referencia en un grupo: parámetros, tipos de entrada y la estructura "Quincenal VE".
 *
 * - `reset` (seed): crea o pisa todo con los valores de referencia.
 * - `add`: solo agrega lo que falta y no toca nada existente. Devuelve `undefined`
 *   si la estructura ya existe.
 */
export async function installSampleCatalog(
  db: DbExecutor,
  groupId: string,
  mode: 'reset' | 'add' = 'reset',
): Promise<string | undefined> {
  const reset = mode === 'reset';

  const [existing] = await db
    .select({ id: salaryStructures.id })
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.groupId, groupId),
        eq(salaryStructures.code, SAMPLE_CODE),
      ),
    );
  if (existing && !reset) return undefined;

  for (const { code, name, value } of SAMPLE_PARAMETERS) {
    await db
      .insert(payrollParameters)
      .values({ groupId, code, name })
      .onConflictDoNothing();
    const [param] = await db
      .select({ id: payrollParameters.id })
      .from(payrollParameters)
      .where(
        and(
          eq(payrollParameters.groupId, groupId),
          eq(payrollParameters.code, code),
        ),
      );
    const values = db
      .insert(payrollParameterValues)
      .values({ parameterId: param.id, dateFrom: SAMPLE_VALUES_FROM, value });
    await (reset
      ? values.onConflictDoUpdate({
          target: [
            payrollParameterValues.parameterId,
            payrollParameterValues.dateFrom,
          ],
          set: { value },
        })
      : values.onConflictDoNothing());
  }
  for (const type of SAMPLE_INPUT_TYPES) {
    await db
      .insert(inputTypes)
      .values({ groupId, ...type })
      .onConflictDoNothing();
  }

  const structureId =
    existing?.id ??
    (
      await db
        .insert(salaryStructures)
        .values({
          groupId,
          code: SAMPLE_CODE,
          name: 'Quincenal VE',
          schedulePay: 'semi_monthly',
        })
        .returning({ id: salaryStructures.id })
    )[0].id;
  await db.delete(salaryRules).where(eq(salaryRules.structureId, structureId));
  await db
    .insert(salaryRules)
    .values(SAMPLE_BIWEEKLY_RULES.map((rule) => ({ ...rule, structureId })));
  return structureId;
}
