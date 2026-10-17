import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  pgError,
  PG_CHECK_VIOLATION,
  PG_EXCLUSION_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
} from '../database/pg-error';
import { EmployeesRepository } from '../employees/employees.repository';
import { SchedulesRepository } from '../schedules/schedules.repository';
import { CatalogRepository } from './catalog.repository';
import { ContractsRepository } from './contracts.repository';
import type {
  ChangeScheduleInput,
  CreateContractInput,
  UpdateContractInput,
} from './payroll.schemas';

function contractConflict(error: unknown): never {
  const code = pgError(error)?.code;
  if (code === PG_EXCLUSION_VIOLATION) {
    throw new ConflictException('Se solapa con otro contrato del colaborador');
  }
  if (code === PG_CHECK_VIOLATION) {
    throw new BadRequestException(
      'El fin debe ser igual o posterior al inicio',
    );
  }
  throw error;
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly employees: EmployeesRepository,
    private readonly catalog: CatalogRepository,
    private readonly schedules: SchedulesRepository,
  ) {}

  async list(companyId: string, employeeId: string) {
    await this.assertEmployee(companyId, employeeId);
    return this.contracts.list(companyId, employeeId);
  }

  async create(
    companyId: string,
    employeeId: string,
    input: CreateContractInput,
  ) {
    await this.assertEmployee(companyId, employeeId);
    const structure = await this.catalog.findStructureForCompany(
      companyId,
      input.structureId,
    );
    if (!structure) throw new NotFoundException('Estructura no encontrada');
    await this.assertSchedule(companyId, input.scheduleId);
    await this.contracts
      .create({ ...input, companyId, employeeId })
      .catch(contractConflict);
    return this.contracts.list(companyId, employeeId);
  }

  /** Cambia la vigencia (inicio y/o fin; `dateEnd: null` la deja sin fin). */
  async update(
    companyId: string,
    employeeId: string,
    contractId: string,
    changes: UpdateContractInput,
  ) {
    const result = await this.contracts
      .update(companyId, employeeId, contractId, changes)
      .catch(contractConflict);
    if (!result) throw new NotFoundException('Contrato no encontrado');
    if (result === 'closed_payroll') {
      throw new ConflictException(
        'Esas fechas tocan una nómina validada o pagada de esta estructura',
      );
    }
    return this.contracts.list(companyId, employeeId);
  }

  /** Borra un contrato creado por error. Si ya tiene recibos, hay que cerrarlo. */
  async remove(companyId: string, employeeId: string, contractId: string) {
    const found = await this.contracts
      .remove(companyId, employeeId, contractId)
      .catch((error: unknown) => {
        if (pgError(error)?.code === PG_FOREIGN_KEY_VIOLATION) {
          throw new ConflictException(
            'El contrato ya tiene recibos de nómina: ciérralo en vez de borrarlo',
          );
        }
        throw error;
      });
    if (!found) throw new NotFoundException('Contrato no encontrado');
    return this.contracts.list(companyId, employeeId);
  }

  /** Desde `dateFrom`, el colaborador sigue con el mismo contrato pero con otro horario. */
  async changeSchedule(
    companyId: string,
    employeeId: string,
    contractId: string,
    { scheduleId, dateFrom }: ChangeScheduleInput,
  ) {
    await this.assertSchedule(companyId, scheduleId);
    const result = await this.contracts
      .changeSchedule(companyId, employeeId, contractId, scheduleId, dateFrom)
      .catch(contractConflict);
    if (!result) throw new NotFoundException('Contrato no encontrado');
    if (result === 'out_of_range') {
      throw new BadRequestException(
        'La fecha debe estar dentro de la vigencia del contrato (desde su inicio)',
      );
    }
    return this.contracts.list(companyId, employeeId);
  }

  private async assertSchedule(companyId: string, scheduleId: string | null) {
    if (!scheduleId) return;
    const schedule = await this.schedules.findForCompany(companyId, scheduleId);
    if (!schedule) throw new NotFoundException('Horario no encontrado');
    if (!schedule.active) {
      throw new BadRequestException('El horario está inactivo');
    }
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    if (!(await this.employees.find(companyId, employeeId))) {
      throw new NotFoundException('Colaborador no encontrado');
    }
  }
}
