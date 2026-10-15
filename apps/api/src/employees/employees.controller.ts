import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from './employees.schemas';
import { EmployeesService } from './employees.service';

/** El acceso a `:companyId` lo valida TenantScopeGuard (global). */
@Roles('admin', 'analyst')
@Controller('companies/:companyId/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  async list(@Param('companyId') companyId: string) {
    return { employees: await this.employees.list(companyId) };
  }

  @Get(':employeeId')
  async get(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { employee: await this.employees.get(companyId, employeeId) };
  }

  /** El analista solo puede dar de alta colaboradores. */
  @Post()
  async create(
    @Param('companyId') companyId: string,
    @Body(new ZodValidationPipe(createEmployeeSchema))
    body: CreateEmployeeInput,
  ) {
    return { employee: await this.employees.create(companyId, body) };
  }

  /** Editar, restablecer el PIN o desactivar es cosa del admin. */
  @Roles('admin')
  @Patch(':employeeId')
  async update(
    @Param('companyId') companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema))
    body: UpdateEmployeeInput,
  ) {
    return {
      employee: await this.employees.update(companyId, employeeId, body),
    };
  }
}
