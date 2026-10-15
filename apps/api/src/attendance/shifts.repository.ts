import { Inject, Injectable } from '@nestjs/common';
import { localDateOf } from '@marcaje/core';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { DB } from '../database/database.constants';
import type { Database, DbExecutor } from '../database/database.module';
import {
  employees,
  payrollRuns,
  shiftCorrections,
  shifts,
  users,
  type ShiftSnapshot,
} from '../database/schema';

export interface Shift {
  id: string;
  companyId: string;
  employeeId: string;
  clockIn: Date;
  clockOut: Date | null;
}

export interface ShiftWithEmployee extends Shift {
  employee: { id: string; name: string; cedula: string };
  corrections: number;
}

export interface ShiftTimes {
  clockIn: Date;
  clockOut: Date | null;
}

const shiftColumns = {
  id: shifts.id,
  companyId: shifts.companyId,
  employeeId: shifts.employeeId,
  clockIn: shifts.clockIn,
  clockOut: shifts.clockOut,
};

const snapshot = ({ clockIn, clockOut }: ShiftTimes): ShiftSnapshot => ({
  clockIn: clockIn.toISOString(),
  clockOut: clockOut?.toISOString() ?? null,
});

/** El turno cae en un período cuya nómina ya se validó o pagó. */
export class PayrollClosedError extends Error {
  constructor() {
    super('El período ya está en una nómina validada o pagada');
  }
}

/** Falla si algún día local de esos instantes está en un lote validado o pagado de la empresa. */
async function assertPayrollOpen(
  db: DbExecutor,
  companyId: string,
  instants: Date[],
) {
  const days = [...new Set(instants.map((instant) => localDateOf(instant)))];
  const [closed] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.companyId, companyId),
        inArray(payrollRuns.state, ['validated', 'paid']),
        or(
          ...days.map((day) =>
            and(lte(payrollRuns.dateFrom, day), gte(payrollRuns.dateTo, day)),
          ),
        ),
      ),
    )
    .limit(1);
  if (closed) throw new PayrollClosedError();
}

/** Rango de instantes [from, to) por la hora de entrada. */
export interface InstantRange {
  from: Date;
  to: Date;
}

@Injectable()
export class ShiftsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findOpen(employeeId: string): Promise<Shift | undefined> {
    const [row] = await this.db
      .select(shiftColumns)
      .from(shifts)
      .where(and(eq(shifts.employeeId, employeeId), isNull(shifts.clockOut)));
    return row;
  }

  async open(companyId: string, employeeId: string, at: Date): Promise<Shift> {
    const [row] = await this.db
      .insert(shifts)
      .values({ companyId, employeeId, clockIn: at })
      .returning(shiftColumns);
    return row;
  }

  /** Cierra el turno si sigue abierto. `undefined` si otro request lo cerró antes. */
  async close(shiftId: string, at: Date): Promise<Shift | undefined> {
    const [row] = await this.db
      .update(shifts)
      .set({ clockOut: at, updatedAt: sql`now()` })
      .where(and(eq(shifts.id, shiftId), isNull(shifts.clockOut)))
      .returning(shiftColumns);
    return row;
  }

  listForEmployee(employeeId: string, range: InstantRange): Promise<Shift[]> {
    return this.db
      .select(shiftColumns)
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          gte(shifts.clockIn, range.from),
          lt(shifts.clockIn, range.to),
        ),
      )
      .orderBy(desc(shifts.clockIn));
  }

  /** Turnos de la empresa que empiezan en el rango, o los abiertos si `range` es `'open'`. */
  listForCompany(
    companyId: string,
    range: InstantRange | 'open',
    employeeId?: string,
  ): Promise<ShiftWithEmployee[]> {
    return this.db
      .select({
        ...shiftColumns,
        employee: {
          id: employees.id,
          name: employees.name,
          cedula: employees.cedula,
        },
        corrections: sql<number>`(
          select count(*)::int from ${shiftCorrections}
          where ${shiftCorrections.shiftId} = ${shifts.id}
        )`,
      })
      .from(shifts)
      .innerJoin(employees, eq(employees.id, shifts.employeeId))
      .where(
        and(
          eq(shifts.companyId, companyId),
          range === 'open'
            ? isNull(shifts.clockOut)
            : and(
                gte(shifts.clockIn, range.from),
                lt(shifts.clockIn, range.to),
              ),
          employeeId ? eq(shifts.employeeId, employeeId) : undefined,
        ),
      )
      .orderBy(asc(shifts.clockIn));
  }

  /**
   * Corrige un turno y deja el antes, el después, quién y por qué, en una transacción.
   * `apply` recibe el turno bloqueado (FOR UPDATE) y devuelve las horas nuevas; si lanza, no se guarda nada.
   */
  correct(
    companyId: string,
    shiftId: string,
    correction: { reason: string; correctedBy: string },
    apply: (current: Shift) => ShiftTimes,
  ): Promise<Shift | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select(shiftColumns)
        .from(shifts)
        .where(and(eq(shifts.companyId, companyId), eq(shifts.id, shiftId)))
        .for('update');
      if (!current) return undefined;

      const next = apply(current);
      // Un turno de un período ya validado no se toca (ni el día de origen ni el de destino).
      await assertPayrollOpen(tx, companyId, [current.clockIn, next.clockIn]);
      const [updated] = await tx
        .update(shifts)
        .set({ ...next, updatedAt: sql`now()` })
        .where(eq(shifts.id, shiftId))
        .returning(shiftColumns);
      await tx.insert(shiftCorrections).values({
        shiftId,
        companyId,
        ...correction,
        before: snapshot(current),
        after: snapshot(next),
      });
      return updated;
    });
  }

  /** Turno creado por RRHH (olvido total), con su registro en el historial. */
  createManual(
    companyId: string,
    employeeId: string,
    times: ShiftTimes,
    correction: { reason: string; correctedBy: string },
  ): Promise<Shift> {
    return this.db.transaction(async (tx) => {
      await assertPayrollOpen(tx, companyId, [times.clockIn]);
      const [created] = await tx
        .insert(shifts)
        .values({ companyId, employeeId, ...times })
        .returning(shiftColumns);
      await tx.insert(shiftCorrections).values({
        shiftId: created.id,
        companyId,
        ...correction,
        before: null,
        after: snapshot(times),
      });
      return created;
    });
  }

  listCorrections(companyId: string, shiftId: string) {
    return this.db
      .select({
        id: shiftCorrections.id,
        reason: shiftCorrections.reason,
        before: shiftCorrections.before,
        after: shiftCorrections.after,
        createdAt: shiftCorrections.createdAt,
        correctedBy: { id: users.id, name: users.name },
      })
      .from(shiftCorrections)
      .innerJoin(users, eq(users.id, shiftCorrections.correctedBy))
      .where(
        and(
          eq(shiftCorrections.companyId, companyId),
          eq(shiftCorrections.shiftId, shiftId),
        ),
      )
      .orderBy(desc(shiftCorrections.createdAt));
  }
}
