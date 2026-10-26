import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computePayslip,
  workedMinutesFromAttendance,
  type Period,
  type SalaryRule,
} from '@marcaje/core';
import { pgError, PG_EXCLUSION_VIOLATION } from '../database/pg-error';
import { PeriodsService, resolvePeriod } from '../periods/periods.service';
import { CatalogRepository } from './catalog.repository';
import { ContractsRepository } from './contracts.repository';
import type { CreateRunInput } from './payroll.schemas';
import {
  RunsRepository,
  type PayslipCalculation,
  type RunState,
} from './runs.repository';

interface CalcContext {
  rules: SalaryRule[];
  parameters: Record<string, number>;
  period: Period;
  minutesByEmployee: Map<
    string,
    Parameters<typeof workedMinutesFromAttendance>[0]
  >;
}

const NO_MINUTES = {
  worked: 0,
  nightOrdinary: 0,
  overtimeDay: 0,
  overtimeNight: 0,
};
const PERIOD_NAME_FORMAT = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/**
 * Lotes de recibos: se calculan con las horas del motor de asistencia, los parámetros vigentes
 * al cierre del período y las reglas actuales de la estructura. Al validarse, quedan fijos y
 * bloquean las correcciones de turnos del período de quienes tienen recibo (ver ShiftsRepository).
 */
@Injectable()
export class RunsService {
  constructor(
    private readonly runs: RunsRepository,
    private readonly catalog: CatalogRepository,
    private readonly contracts: ContractsRepository,
    private readonly periods: PeriodsService,
  ) {}

  list(companyId: string) {
    return this.runs.list(companyId);
  }

  async get(companyId: string, runId: string) {
    const run = await this.runs.find(companyId, runId);
    if (!run) throw new NotFoundException('Lote no encontrado');
    return { ...run, payslips: await this.runs.payslips(runId) };
  }

  employeePayslips(companyId: string, employeeId: string) {
    return this.runs.listForEmployee(employeeId, {
      companyId,
      states: ['computed', 'validated', 'paid'],
    });
  }

  async getPayslip(companyId: string, payslipId: string) {
    const slip = await this.runs.findPayslip({ companyId }, payslipId);
    if (!slip) throw new NotFoundException('Recibo no encontrado');
    return slip;
  }

  async create(companyId: string, createdBy: string, input: CreateRunInput) {
    const period = resolvePeriod(input);
    const structure = await this.catalog.findStructureForCompany(
      companyId,
      input.structureId,
    );
    if (!structure) throw new NotFoundException('Estructura no encontrada');
    const contracts = await this.contracts.forRun(
      companyId,
      structure.id,
      period,
    );
    if (contracts.length === 0) {
      throw new BadRequestException(
        'Ningún colaborador tiene un contrato con esta estructura en el período',
      );
    }

    const ctx = await this.context(
      companyId,
      structure.id,
      structure.groupId,
      period,
    );
    const calculations = contracts.map((contract) =>
      this.calculate(
        ctx,
        {
          employeeId: contract.employeeId,
          contractId: contract.id,
          wage: contract.wage,
        },
        {},
      ),
    );
    const name =
      input.name ||
      `${structure.name} · ${PERIOD_NAME_FORMAT.format(new Date(period.from))} – ${PERIOD_NAME_FORMAT.format(new Date(period.to))}`;

    const runId = await this.runs
      .createRun(
        {
          companyId,
          structureId: structure.id,
          name,
          dateFrom: period.from,
          dateTo: period.to,
          createdBy,
        },
        calculations,
      )
      .catch((error: unknown) => {
        if (pgError(error)?.code === PG_EXCLUSION_VIOLATION) {
          throw new ConflictException(
            'Ya hay un lote vigente de esta estructura que se solapa con el período',
          );
        }
        throw error;
      });
    return this.get(companyId, runId);
  }

  /** Vuelve a calcular todos los recibos con las horas, reglas y parámetros actuales. */
  async recompute(companyId: string, runId: string) {
    const run = await this.editableRun(companyId, runId);
    const ctx = await this.context(
      companyId,
      run.structure.id,
      run.structure.groupId,
      {
        from: run.dateFrom,
        to: run.dateTo,
      },
    );
    const slips = await Promise.all(
      (await this.runs.payslips(runId)).map((s) =>
        this.runs.findPayslip({ companyId }, s.id),
      ),
    );
    await this.runs.replaceCalculations(
      runId,
      slips.flatMap((slip) =>
        slip
          ? [
              {
                payslipId: slip.id,
                calc: this.calculate(
                  ctx,
                  {
                    employeeId: slip.employee.id,
                    contractId: slip.contractId,
                    wage: slip.wage,
                  },
                  slip.inputs,
                ),
              },
            ]
          : [],
      ),
    );
    return this.get(companyId, runId);
  }

  /** Reemplaza las entradas manuales de un recibo y lo recalcula. */
  async setInputs(
    companyId: string,
    payslipId: string,
    inputs: Record<string, number>,
  ) {
    const slip = await this.getPayslip(companyId, payslipId);
    const run = await this.editableRun(companyId, slip.runId);
    const known = new Set(
      (await this.catalog.listInputTypes(run.structure.groupId)).map(
        (t) => t.code,
      ),
    );
    const unknown = Object.keys(inputs).filter((code) => !known.has(code));
    if (unknown.length > 0)
      throw new BadRequestException(
        `Entradas desconocidas: ${unknown.join(', ')}`,
      );

    const ctx = await this.context(
      companyId,
      run.structure.id,
      run.structure.groupId,
      {
        from: run.dateFrom,
        to: run.dateTo,
      },
    );
    const clean = Object.fromEntries(
      Object.entries(inputs).filter(([, amount]) => amount !== 0),
    );
    await this.runs.replaceCalculations(run.id, [
      {
        payslipId,
        calc: this.calculate(
          ctx,
          {
            employeeId: slip.employee.id,
            contractId: slip.contractId,
            wage: slip.wage,
          },
          clean,
        ),
      },
    ]);
    return this.getPayslip(companyId, payslipId);
  }

  /** Valida el lote. No se puede con turnos abiertos en el período: esas horas no se pagarían. */
  async validate(companyId: string, runId: string) {
    const run = await this.editableRun(companyId, runId);
    const summary = await this.periods.summary(companyId, {
      from: run.dateFrom,
      to: run.dateTo,
    });
    const inRun = new Set(
      (await this.runs.payslips(runId)).map((s) => s.employee.id),
    );
    const open = summary.rows.filter(
      (row) => inRun.has(row.employee.id) && row.openShifts > 0,
    );
    if (open.length > 0) {
      throw new ConflictException(
        `Hay turnos sin salida en el período: ${open.map((r) => r.employee.name).join(', ')}. Corrígelos y recalcula.`,
      );
    }
    return this.transition(companyId, runId, ['computed'], 'validated');
  }

  pay(companyId: string, runId: string) {
    return this.transition(companyId, runId, ['validated'], 'paid');
  }

  cancel(companyId: string, runId: string) {
    return this.transition(
      companyId,
      runId,
      ['computed', 'validated'],
      'cancelled',
    );
  }

  private async transition(
    companyId: string,
    runId: string,
    from: RunState[],
    to: RunState,
  ) {
    const run = await this.runs.find(companyId, runId);
    if (!run) throw new NotFoundException('Lote no encontrado');
    if (!(await this.runs.transition(companyId, runId, from, to))) {
      throw new ConflictException(
        `El lote está ${STATE_LABEL[run.state]} y no se puede pasar a ${STATE_LABEL[to]}`,
      );
    }
    return this.get(companyId, runId);
  }

  private async editableRun(companyId: string, runId: string) {
    const run = await this.runs.find(companyId, runId);
    if (!run) throw new NotFoundException('Lote no encontrado');
    if (run.state !== 'computed') {
      throw new ConflictException(
        `El lote está ${STATE_LABEL[run.state]}: ya no se puede recalcular`,
      );
    }
    return run;
  }

  private async context(
    companyId: string,
    structureId: string,
    groupId: string,
    period: Period,
  ): Promise<CalcContext> {
    const [rules, parameters, summary] = await Promise.all([
      this.catalog.rules(structureId),
      this.catalog.parameterValuesAt(groupId, period.to),
      this.periods.summary(companyId, period),
    ]);
    return {
      rules,
      parameters,
      period,
      minutesByEmployee: new Map(
        summary.rows.map((row) => [row.employee.id, row.minutes]),
      ),
    };
  }

  private calculate(
    ctx: CalcContext,
    contract: { employeeId: string; contractId: string; wage: number },
    inputs: Record<string, number>,
  ): PayslipCalculation {
    const workedMinutes = workedMinutesFromAttendance(
      ctx.minutesByEmployee.get(contract.employeeId) ?? NO_MINUTES,
    );
    try {
      const result = computePayslip({
        wage: contract.wage,
        rules: ctx.rules,
        workedMinutes,
        inputs,
        parameters: ctx.parameters,
        period: ctx.period,
      });
      return { ...contract, workedMinutes, inputs, result };
    } catch (error) {
      // Estructura incompleta (p. ej. falta un parámetro): es un error de configuración, no del servidor.
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'No se pudo calcular el recibo',
      );
    }
  }
}

const STATE_LABEL: Record<RunState, string> = {
  computed: 'calculado',
  validated: 'validado',
  paid: 'pagado',
  cancelled: 'anulado',
};
