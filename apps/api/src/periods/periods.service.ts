import { Injectable } from '@nestjs/common';
import {
  alertWindow,
  periodFor,
  periodToCsv,
  summarizePeriod,
  type Period,
  type ShiftRecord,
} from '@marcaje/core';
import { instantRange } from '../attendance/attendance.service';
import { ShiftsRepository } from '../attendance/shifts.repository';
import { EmployeesRepository } from '../employees/employees.repository';
import type { PeriodQuery } from './periods.schemas';

export const resolvePeriod = (query: PeriodQuery): Period =>
  'kind' in query ? periodFor(query.kind, query.date) : query;

@Injectable()
export class PeriodsService {
  constructor(
    private readonly shifts: ShiftsRepository,
    private readonly employees: EmployeesRepository,
  ) {}

  /**
   * Horas de cada colaborador en el período, con alertas semanales.
   * Incluye a todos los activos (aunque tengan 0 h) y a los inactivos que trabajaron en el período,
   * para que desactivar a alguien a mitad de quincena no le quite horas de la nómina.
   */
  async summary(companyId: string, period: Period) {
    const [employees, shifts] = await Promise.all([
      this.employees.list(companyId),
      // Semanas completas: las alertas miran también días fuera del período.
      this.shifts.listForCompany(companyId, instantRange(alertWindow(period))),
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
        ...summarizePeriod(byEmployee.get(id) ?? [], period),
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
