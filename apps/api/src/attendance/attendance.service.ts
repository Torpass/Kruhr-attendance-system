import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  computeShift,
  isStaleOpenShift,
  localDateOf,
  startOfLocalDay,
  type Period,
  type WorkPolicy,
} from '@marcaje/core';
import type { SessionUser } from '../common/auth/session';
import {
  pgError,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '../database/pg-error';
import { EmployeesRepository } from '../employees/employees.repository';
import { SchedulesService } from '../schedules/schedules.service';
import type {
  CorrectShiftInput,
  CreateShiftInput,
  ShiftsQuery,
} from './attendance.schemas';
import {
  PayrollClosedError,
  ShiftsRepository,
  type InstantRange,
  type Shift,
  type ShiftTimes,
} from './shifts.repository';

type EmployeeSession = Extract<SessionUser, { kind: 'employee' }>;

/** Margen para el reloj del cliente al corregir: no se aceptan horas en el futuro. */
const FUTURE_TOLERANCE_MS = 60_000;

/** Instantes de un rango de fechas locales: [00:00 de `from`, 00:00 del día después de `to`). */
export const instantRange = ({ from, to }: Period): InstantRange => ({
  from: startOfLocalDay(from),
  to: startOfLocalDay(addDays(to, 1)),
});

/** Turno con sus minutos ya clasificados según la política de su día (null mientras sigue abierto). */
function withMinutes<T extends Shift>(shift: T, policy: WorkPolicy) {
  return {
    ...shift,
    date: localDateOf(shift.clockIn),
    minutes:
      shift.clockOut === null
        ? null
        : computeShift(
            { clockIn: shift.clockIn, clockOut: shift.clockOut },
            policy,
          ),
  };
}

function overlapConflict(error: unknown): never {
  if (error instanceof PayrollClosedError) {
    throw new ConflictException(`${error.message}: no se puede corregir`);
  }
  const code = pgError(error)?.code;
  if (code === PG_EXCLUSION_VIOLATION || code === PG_UNIQUE_VIOLATION) {
    throw new ConflictException(
      'El turno se solapa con otro turno del colaborador',
    );
  }
  throw error;
}

function assertValidTimes({ clockIn, clockOut }: ShiftTimes, now: Date) {
  const limit = now.getTime() + FUTURE_TOLERANCE_MS;
  if (clockIn.getTime() > limit || (clockOut && clockOut.getTime() > limit)) {
    throw new BadRequestException('Las horas no pueden estar en el futuro');
  }
  if (clockOut && clockOut <= clockIn) {
    throw new BadRequestException('La salida debe ser posterior a la entrada');
  }
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly shifts: ShiftsRepository,
    private readonly employees: EmployeesRepository,
    private readonly schedules: SchedulesService,
  ) {}

  /** Clasifica los turnos con el horario del contrato vigente de cada colaborador ese día. */
  private async classify<T extends Shift>(shifts: T[]) {
    if (shifts.length === 0) return [];
    const dates = shifts.map((shift) => localDateOf(shift.clockIn)).sort();
    const companyIds = [...new Set(shifts.map((shift) => shift.companyId))];
    const period = { from: dates[0], to: dates[dates.length - 1] };
    const policies = new Map(
      await Promise.all(
        companyIds.map(
          async (id) =>
            [id, await this.schedules.policiesFor(id, period)] as const,
        ),
      ),
    );
    return shifts.map((shift) =>
      withMinutes(
        shift,
        policies.get(shift.companyId)!(shift.employeeId)(
          localDateOf(shift.clockIn),
        ),
      ),
    );
  }

  private async classifyOne<T extends Shift>(shift: T) {
    const [classified] = await this.classify([shift]);
    return classified;
  }

  // ── Colaborador ────────────────────────────────────────────────────────────

  /** Abre un turno con la hora del servidor. */
  async clockIn(user: EmployeeSession) {
    const now = new Date();
    const open = await this.shifts.findOpen(user.id);
    if (open) {
      throw new ConflictException(
        isStaleOpenShift(open.clockIn, now)
          ? 'Tienes un turno anterior sin salida. Pide a RRHH que lo corrija.'
          : 'Ya tienes un turno abierto',
      );
    }
    const shift = await this.shifts
      .open(user.companyIds[0], user.id, now)
      .catch(overlapConflict);
    return this.classifyOne(shift);
  }

  /** Cierra el turno abierto con la hora del servidor. Un olvido de 16 h o más lo corrige RRHH. */
  async clockOut(user: EmployeeSession) {
    const now = new Date();
    const open = await this.shifts.findOpen(user.id);
    if (!open) throw new ConflictException('No tienes un turno abierto');
    if (isStaleOpenShift(open.clockIn, now)) {
      throw new ConflictException(
        'Tu turno anterior quedó sin salida. Pide a RRHH que lo corrija.',
      );
    }
    const closed = await this.shifts.close(open.id, now).catch(overlapConflict);
    if (!closed) throw new ConflictException('El turno ya estaba cerrado');
    return this.classifyOne(closed);
  }

  /** Estado actual y turnos de hoy (hora de Caracas). */
  async myToday(user: EmployeeSession) {
    const now = new Date();
    const today = localDateOf(now);
    const [open, shifts] = await Promise.all([
      this.shifts.findOpen(user.id),
      this.shifts.listForEmployee(
        user.id,
        instantRange({ from: today, to: today }),
      ),
    ]);
    return {
      date: today,
      openShift: open ? await this.classifyOne(open) : null,
      openShiftIsStale: open ? isStaleOpenShift(open.clockIn, now) : false,
      shifts: await this.classify(shifts),
    };
  }

  async myShifts(user: EmployeeSession, period: Period) {
    const shifts = await this.shifts.listForEmployee(
      user.id,
      instantRange(period),
    );
    return this.classify(shifts);
  }

  // ── RRHH ───────────────────────────────────────────────────────────────────

  /**
   * Ver el día: quién está dentro, quién no ha marcado y quién marcó entrada pero no salida.
   * "Dentro" = turno abierto de menos de 16 h (incluye un turno nocturno que empezó ayer).
   * "Sin salida" = turno abierto de 16 h o más.
   */
  async companyToday(companyId: string) {
    const now = new Date();
    const today = localDateOf(now);
    const [active, open, todays] = await Promise.all([
      this.employees.list(companyId, { onlyActive: true }),
      this.shifts.listForCompany(companyId, 'open'),
      this.shifts.listForCompany(
        companyId,
        instantRange({ from: today, to: today }),
      ),
    ]);

    const inside = open.filter(
      (shift) => !isStaleOpenShift(shift.clockIn, now),
    );
    const missingClockOut = open.filter((shift) =>
      isStaleOpenShift(shift.clockIn, now),
    );
    const marked = new Set([
      ...open.map((shift) => shift.employeeId),
      ...todays.map((shift) => shift.employeeId),
    ]);
    const notClockedIn = active.filter((employee) => !marked.has(employee.id));
    const finished = todays.filter(
      (shift) =>
        shift.clockOut !== null &&
        !open.some((other) => other.employeeId === shift.employeeId),
    );

    const view = (shift: (typeof open)[number]) => ({
      shiftId: shift.id,
      employee: shift.employee,
      clockIn: shift.clockIn,
      clockOut: shift.clockOut,
    });
    return {
      date: today,
      counts: {
        active: active.length,
        inside: inside.length,
        notClockedIn: notClockedIn.length,
        missingClockOut: missingClockOut.length,
      },
      inside: inside.map(view),
      missingClockOut: missingClockOut.map(view),
      notClockedIn: notClockedIn.map(({ id, name, cedula }) => ({
        id,
        name,
        cedula,
      })),
      finished: finished.map(view),
    };
  }

  async listShifts(companyId: string, { employeeId, ...period }: ShiftsQuery) {
    const shifts = await this.shifts.listForCompany(
      companyId,
      instantRange(period),
      employeeId,
    );
    return this.classify(shifts);
  }

  /** Corrige entrada y/o salida. El motivo es obligatorio y queda en el historial. */
  async correctShift(
    companyId: string,
    shiftId: string,
    { reason, ...changes }: CorrectShiftInput,
    correctedBy: string,
  ) {
    const now = new Date();
    const shift = await this.shifts
      .correct(companyId, shiftId, { reason, correctedBy }, (current) => {
        const next = {
          clockIn: changes.clockIn ?? current.clockIn,
          clockOut: changes.clockOut ?? current.clockOut,
        };
        assertValidTimes(next, now);
        return next;
      })
      .catch(overlapConflict);
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return this.classifyOne(shift);
  }

  /** Turno creado por RRHH cuando el colaborador no marcó nada. */
  async createShift(
    companyId: string,
    { employeeId, reason, ...times }: CreateShiftInput,
    correctedBy: string,
  ) {
    assertValidTimes(times, new Date());
    const employee = await this.employees.find(companyId, employeeId);
    if (!employee) throw new NotFoundException('Colaborador no encontrado');
    const shift = await this.shifts
      .createManual(companyId, employeeId, times, { reason, correctedBy })
      .catch(overlapConflict);
    return this.classifyOne(shift);
  }

  corrections(companyId: string, shiftId: string) {
    return this.shifts.listCorrections(companyId, shiftId);
  }
}
