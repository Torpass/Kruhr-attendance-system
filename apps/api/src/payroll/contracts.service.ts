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
} from '../database/pg-error';
import { EmployeesRepository } from '../employees/employees.repository';
import { CatalogRepository } from './catalog.repository';
import { ContractsRepository } from './contracts.repository';
import type { CreateContractInput } from './payroll.schemas';

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
    await this.contracts
      .create({ ...input, companyId, employeeId })
      .catch(contractConflict);
    return this.contracts.list(companyId, employeeId);
  }

  async end(
    companyId: string,
    employeeId: string,
    contractId: string,
    dateEnd: string,
  ) {
    const found = await this.contracts
      .end(companyId, contractId, dateEnd)
      .catch(contractConflict);
    if (!found) throw new NotFoundException('Contrato no encontrado');
    return this.contracts.list(companyId, employeeId);
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    if (!(await this.employees.find(companyId, employeeId))) {
      throw new NotFoundException('Colaborador no encontrado');
    }
  }
}
