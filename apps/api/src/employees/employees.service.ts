import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashSecret } from '../auth/password';
import { pgError, PG_UNIQUE_VIOLATION } from '../database/pg-error';
import { EmployeesRepository } from './employees.repository';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './employees.schemas';

@Injectable()
export class EmployeesService {
  constructor(private readonly employees: EmployeesRepository) {}

  list(companyId: string) {
    return this.employees.list(companyId);
  }

  async get(companyId: string, id: string) {
    const employee = await this.employees.find(companyId, id);
    if (!employee) throw new NotFoundException('Colaborador no encontrado');
    return employee;
  }

  async create(companyId: string, { password, ...input }: CreateEmployeeInput) {
    try {
      return await this.employees.create({
        ...input,
        companyId,
        passwordHash: await hashSecret(password),
      });
    } catch (error) {
      if (pgError(error)?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'Ya existe un colaborador con esa cédula en la empresa',
        );
      }
      throw error;
    }
  }

  async update(companyId: string, id: string, input: UpdateEmployeeInput) {
    const employee = await this.employees.update(companyId, id, input);
    if (!employee) throw new NotFoundException('Colaborador no encontrado');
    return employee;
  }

  async setPassword(companyId: string, id: string, password: string) {
    const employee = await this.employees.update(companyId, id, {
      passwordHash: await hashSecret(password),
    });
    if (!employee) throw new NotFoundException('Colaborador no encontrado');
  }
}
