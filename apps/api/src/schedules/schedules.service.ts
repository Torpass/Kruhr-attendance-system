import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_POLICY,
  validatePolicy,
  type LocalDate,
  type Period,
  type PolicyFor,
  type WorkPolicy,
} from '@marcaje/core';
import { pgError, PG_UNIQUE_VIOLATION } from '../database/pg-error';
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
} from './schedules.schemas';
import { SchedulesRepository, type ScheduleRow } from './schedules.repository';

/** Política de cálculo de un horario guardado. */
export const toPolicy = (schedule: ScheduleRow): WorkPolicy => ({
  overtimeMode: schedule.overtimeMode,
  ordinaryMinutes: schedule.ordinaryMinutes,
  days: schedule.days,
  breakMinutes: schedule.breakMinutes,
  breakAfterMinutes: schedule.breakAfterMinutes,
  nightStart: schedule.nightStart,
  nightEnd: schedule.nightEnd,
  weeklyOvertimeAlertMinutes: schedule.weeklyOvertimeAlertMinutes,
});

/** Política de cada colaborador en cada día: `policies(employeeId)(date)`. */
export type PoliciesByEmployee = (employeeId: string) => PolicyFor;

@Injectable()
export class SchedulesService {
  constructor(private readonly schedules: SchedulesRepository) {}

  list(groupId: string) {
    return this.schedules.list(groupId);
  }

  async get(groupId: string, id: string) {
    const schedule = await this.schedules.find(groupId, id);
    if (!schedule) throw new NotFoundException('Horario no encontrado');
    return schedule;
  }

  async create(groupId: string, input: CreateScheduleInput) {
    const id = await this.schedules.create(groupId, input).catch(duplicateCode);
    return this.get(groupId, id);
  }

  /** Valida la política ya combinada con los valores actuales antes de guardar. */
  async update(groupId: string, id: string, changes: UpdateScheduleInput) {
    const current = await this.get(groupId, id);
    const errors = validatePolicy(toPolicy({ ...current, ...changes }));
    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors[0],
        errors: { policy: errors },
      });
    }
    await this.schedules.update(groupId, id, changes);
    return this.get(groupId, id);
  }

  /**
   * Contratos de los colaboradores de la empresa en el período: si tenía contrato cada día
   * (`hasContract`) y su política (`policyFor`): la del horario del contrato vigente; sin
   * contrato o sin horario, la política por defecto.
   */
  async contractTerms(companyId: string, period: Period) {
    const rows = await this.schedules.contractSchedules(companyId, period);
    const byEmployee = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push(row);
      byEmployee.set(row.employeeId, list);
    }
    return (employeeId: string) => {
      const contracts = byEmployee.get(employeeId) ?? [];
      const contractOn = (date: LocalDate) =>
        contracts.find(
          (c) =>
            c.dateStart <= date && (c.dateEnd === null || date <= c.dateEnd),
        );
      return {
        hasContract: (date: LocalDate) => Boolean(contractOn(date)),
        policyFor: (date: LocalDate) => {
          const schedule = contractOn(date)?.schedule;
          return schedule ? toPolicy(schedule) : DEFAULT_POLICY;
        },
      };
    };
  }

  /** Política de cada colaborador en cada día (ver `contractTerms`). */
  async policiesFor(
    companyId: string,
    period: Period,
  ): Promise<PoliciesByEmployee> {
    const terms = await this.contractTerms(companyId, period);
    return (employeeId) => terms(employeeId).policyFor;
  }
}

function duplicateCode(error: unknown): never {
  if (pgError(error)?.code === PG_UNIQUE_VIOLATION) {
    throw new ConflictException('Ya existe un horario con ese código');
  }
  throw error;
}
