import { Injectable } from '@nestjs/common';
import {
  addDays,
  alertWindow,
  compareAttendance,
  DAY_STATUSES,
  periodFor,
  periodToCsv,
  summarizePeriod,
  type Period,
  type ShiftRecord,
} from '@marcaje/core';
import { instantRange } from '../attendance/attendance.service';
import { ShiftsRepository } from '../attendance/shifts.repository';
import { EmployeesRepository } from '../employees/employees.repository';
import { SchedulesService } from '../schedules/schedules.service';
import type { PeriodQuery } from './periods.schemas';

export const resolvePeriod = (query: PeriodQuery): Period =>
  'kind' in query ? periodFor(query.kind, query.date) : query;

@Injectable()
export class PeriodsService {
  constructor(
    private readonly shifts: ShiftsRepository,
    private readonly employees: EmployeesRepository,
    private readonly schedules: SchedulesService,
  ) {}

  /**
   * Horas de cada colaborador en el período, con alertas semanales.
   * Incluye a todos los activos (aunque tengan 0 h) y a los inactivos que trabajaron en el período,
   * para que desactivar a alguien a mitad de quincena no le quite horas de la nómina.
   */
  async summary(companyId: string, period: Period) {
    // Semanas completas: las alertas miran también días fuera del período.
    const window = alertWindow(period);
    const [employees, shifts, policies] = await Promise.all([
      this.employees.list(companyId),
      this.shifts.listForCompany(companyId, instantRange(window)),
      this.schedules.policiesFor(companyId, window),
    ]);

    const byEmployee = new Map<string, ShiftRecord[]>();
    for (const shift of shifts) {
      const list = byEmployee.get(shift.employeeId) ?? [];
      list.push(shift);
      byEmployee.set(shift.employeeId, list);
    }

    const rows = employees
      .map(({ id, cedula, name, active }) => ({
        employee: { id, cedula, name, active },
        ...summarizePeriod(byEmployee.get(id) ?? [], period, policies(id)),
      }))
      .filter(
        (row) =>
          row.employee.active || row.minutes.worked > 0 || row.openShifts > 0,
      );

    return {
      period,
      rows,
      alerts: rows.filter((row) => row.overtimeAlert).length,
      openShifts: rows.reduce((sum, row) => sum + row.openShifts, 0),
    };
  }

  /**
   * Horario contra marcajes, por colaborador y día (ver `compareAttendance` en core).
   * Carga un día antes y uno después para las jornadas nocturnas que cruzan la medianoche.
   * Lista a los activos y a los inactivos que marcaron en el período.
   */
  async attendance(companyId: string, period: Period) {
    const window = {
      from: addDays(period.from, -1),
      to: addDays(period.to, 1),
    };
    const [employees, shifts, terms] = await Promise.all([
      this.employees.list(companyId),
      this.shifts.listForCompany(companyId, instantRange(window)),
      this.schedules.contractTerms(companyId, window),
    ]);

    const byEmployee = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      byEmployee.set(shift.employeeId, [
        ...(byEmployee.get(shift.employeeId) ?? []),
        shift,
      ]);
    }

    const days = employees.flatMap(({ id, cedula, name, active }) =>
      compareAttendance(byEmployee.get(id) ?? [], period, terms(id).policyFor, {
        hasContract: terms(id).hasContract,
      })
        .filter((day) => active || day.shifts.length > 0)
        .map(({ shifts: dayShifts, ...day }) => ({
          ...day,
          employee: { id, cedula, name, active },
          shiftIds: dayShifts.map((s) => s.id),
          corrected: dayShifts.some((s) => s.corrections > 0),
        })),
    );

    const counts = Object.fromEntries(
      DAY_STATUSES.map((status) => [
        status,
        days.filter((day) => day.status === status).length,
      ]),
    );
    return { period, counts, days };
  }

  async csv(companyId: string, period: Period) {
    const { rows } = await this.summary(companyId, period);
    return periodToCsv(
      rows.map(({ employee, hours }) => ({
        cedula: employee.cedula,
        name: employee.name,
        hours,
      })),
      period,
    );
  }
}
